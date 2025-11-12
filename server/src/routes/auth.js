const express = require('express');
const router = express.Router();

module.exports = () => {

  router.post('/connect', async (req, res) => {
    try {
      const { username } = req.body;
      if (!username) return res.status(400).json({ error: 'Username required' });
      
      res.json({ success: true, user: { username } });
    } 
    catch (err) {
      res.status(500).json({ error: 'server error' });
    }
  });

  return router;
};