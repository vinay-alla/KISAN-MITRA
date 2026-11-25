import unittest

from server import simulate
from server.tests.helpers import ApiTestCase


class ManyUsersAtOnce(ApiTestCase):
    cfg_overrides = {'demo_mode': False}

    def test_concurrent_farmers_and_buyers_keep_every_invariant(self):
        report = simulate.run(self.base, self.httpd.app.cfg.db_path, farmers=14, buyers=10, steps=22, seed=11)
        self.assertEqual(report['server_errors'], [])
        self.assertEqual(report['invariant_violations'], [])
        self.assertGreater(report['requests'], 400)


if __name__ == '__main__':
    unittest.main()
