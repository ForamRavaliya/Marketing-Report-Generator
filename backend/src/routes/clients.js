const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

// Get all clients
router.get('/', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT c.*, 
        COUNT(DISTINCT p.id) as report_count,
        MAX(p.report_month) as last_report_month
       FROM clients c
       LEFT JOIN performance_data p ON p.client_id = c.id
       WHERE c.agency_id = $1 AND c.is_active = TRUE
       GROUP BY c.id
       ORDER BY c.name`,
      [req.user.agency_id]
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch clients' });
  }
});

// Get single client
router.get('/:id', async (req, res) => {
  try {
    const result = await db.query(
      'SELECT * FROM clients WHERE id = $1 AND agency_id = $2',
      [req.params.id, req.user.agency_id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Client not found' });
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch client' });
  }
});

// Create client
router.post('/', async (req, res) => {
  try {
    const { name, industry, website, contactEmail, notes } = req.body;
    if (!name) return res.status(400).json({ error: 'Client name required' });

    const result = await db.query(
      'INSERT INTO clients (agency_id, name, industry, website, contact_email, notes) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [req.user.agency_id, name, industry, website, contactEmail, notes]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create client' });
  }
});

// Update client
router.put('/:id', async (req, res) => {
  try {
    const { name, industry, website, contactEmail, notes } = req.body;
    const result = await db.query(
      `UPDATE clients SET name=$1, industry=$2, website=$3, contact_email=$4, notes=$5, updated_at=NOW()
       WHERE id=$6 AND agency_id=$7 RETURNING *`,
      [name, industry, website, contactEmail, notes, req.params.id, req.user.agency_id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Client not found' });
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update client' });
  }
});

// Delete client
router.delete('/:id', async (req, res) => {
  try {
    await db.query(
      'UPDATE clients SET is_active=FALSE WHERE id=$1 AND agency_id=$2',
      [req.params.id, req.user.agency_id]
    );
    res.json({ message: 'Client deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete client' });
  }
});

module.exports = router;
