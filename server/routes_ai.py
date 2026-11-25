"""AI endpoints: assistant chat and photo grading (see ai.py)."""
from . import ai
from .core import audit, route
from .util import ApiError, bad, text

CHAT_MAX = 800


def _quota(ctx, cost=1):
    key = f"ai|{ctx.user['id']}"
    wait = ctx.app.limiter.blocked_for(key, ctx.cfg.ai_per_hour, 3600)
    if wait:
        raise ApiError(429, 'ai_quota', f'You have reached the hourly AI limit ({ctx.cfg.ai_per_hour}). Try again later.', headers={'Retry-After': str(wait)})
    for _ in range(cost):
        ctx.app.limiter.hit(key, 3600)


@route('GET', '/api/ai/status')
def ai_status(ctx):
    return {'enabled': bool(ctx.cfg.ai_key), 'model': ctx.cfg.ai_model if ctx.cfg.ai_key else None, 'perHour': ctx.cfg.ai_per_hour}


@route('POST', '/api/ai/chat')
def ai_chat(ctx):
    if not ctx.cfg.ai_key:
        raise ApiError(503, 'ai_disabled', 'The AI assistant is not enabled on this server.')
    b = ctx.body()
    message = text(b.get('message'), 'Message', min_len=1, max_len=CHAT_MAX, collapse=False)
    language = ctx.user['language']
    _quota(ctx)
    messages = ai.clean_history(b.get('history')) + [{'role': 'user', 'content': message}]
    system = ai.system_prompt(language, ai.build_context(ctx.db, ctx.user))
    reply = ai.call_claude(ctx.cfg, system=system, messages=messages, max_tokens=450)
    audit(ctx, 'ai_chat', 'ai', None)
    return {'reply': reply, 'source': 'claude', 'model': ctx.cfg.ai_model}


@route('POST', '/api/ai/grade', roles=('farmer', 'fpo_operator'))
def ai_grade(ctx):
    if not ctx.cfg.ai_key:
        raise ApiError(503, 'ai_disabled', 'AI grading is not enabled on this server.')
    b = ctx.body()
    image = b.get('image')
    m = ai.IMAGE_RE.match(image) if isinstance(image, str) and len(image) <= ai.MAX_IMAGE_B64 + 40 else None
    if not m:
        raise bad('image must be a JPEG, PNG or WebP data URL (resize photos to about 1000px first).', 'invalid_image')
    _quota(ctx, cost=2)
    content = [
        {'type': 'image', 'source': {'type': 'base64', 'media_type': m.group(1), 'data': m.group(2)}},
        {'type': 'text', 'text': ai.GRADE_PROMPT + (f' The farmer says this is {b["crop"][:40]}.' if isinstance(b.get('crop'), str) and b['crop'].strip() else '')},
    ]
    out = ai.call_claude(ctx.cfg, system='You output only valid JSON.', messages=[{'role': 'user', 'content': content}], max_tokens=700, temperature=0)
    result = ai.parse_grading(out)
    audit(ctx, 'ai_grade', 'ai', None)
    return {**result, 'source': 'claude', 'model': ctx.cfg.ai_model}
