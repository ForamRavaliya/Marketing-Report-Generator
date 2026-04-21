import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getClients, createClient, deleteClient } from '../utils/api';
import toast from 'react-hot-toast';
import { Plus, Search, Trash2, ArrowRight, Building2, X } from 'lucide-react';

const INDUSTRIES = ['E-commerce', 'SaaS', 'Healthcare', 'Education', 'Real Estate', 'Finance', 'Retail', 'Travel', 'Food & Beverage', 'Other'];

export default function Clients() {
  const navigate = useNavigate();
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ name: '', industry: '', website: '', contactEmail: '', notes: '' });
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    getClients().then(setClients).catch(() => toast.error('Failed to load clients')).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { toast.error('Client name required'); return; }
    setSaving(true);
    try {
      await createClient(form);
      toast.success('Client created!');
      setShowModal(false);
      setForm({ name: '', industry: '', website: '', contactEmail: '', notes: '' });
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to create client');
    } finally { setSaving(false); }
  };

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Delete client "${name}"? This cannot be undone.`)) return;
    try {
      await deleteClient(id);
      toast.success('Client deleted');
      load();
    } catch { toast.error('Failed to delete'); }
  };

  const filtered = clients.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.industry || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="fade-in">
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <div className="page-title">Clients</div>
          <div className="page-subtitle">{clients.length} client{clients.length !== 1 ? 's' : ''} in your agency</div>
        </div>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>
          <Plus size={15} /> Add Client
        </button>
      </div>

      {/* Search */}
      <div style={{ position: 'relative', marginBottom: 20 }}>
        <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)' }} />
        <input className="form-input" placeholder="Search clients..." value={search} onChange={e => setSearch(e.target.value)}
          style={{ paddingLeft: 36, maxWidth: 360 }} />
      </div>

      {/* Grid */}
      {loading ? (
        <div className="grid grid-3">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className="card card-pad">
              <div className="skeleton" style={{ height: 16, width: '60%', marginBottom: 8 }} />
              <div className="skeleton" style={{ height: 12, width: '40%', marginBottom: 16 }} />
              <div className="skeleton" style={{ height: 12, width: '80%' }} />
            </div>
          ))}
        </div>
      ) : !filtered.length ? (
        <div className="card" style={{ padding: '48px 24px', textAlign: 'center' }}>
          <Building2 size={40} style={{ margin: '0 auto 12px', color: 'var(--text3)' }} />
          <div style={{ fontWeight: 600, marginBottom: 4 }}>{search ? 'No clients found' : 'No clients yet'}</div>
          <div style={{ color: 'var(--text2)', fontSize: 13, marginBottom: 16 }}>
            {search ? `Try a different search` : 'Add your first client to get started'}
          </div>
          {!search && <button className="btn btn-primary" onClick={() => setShowModal(true)}><Plus size={14} /> Add Client</button>}
        </div>
      ) : (
        <div className="grid grid-3">
          {filtered.map((c, i) => (
            <div key={c.id} className="card" style={{ cursor: 'pointer', transition: 'all .15s', position: 'relative' }}
              onMouseEnter={e => { e.currentTarget.style.boxShadow = 'var(--shadow-md)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
              onMouseLeave={e => { e.currentTarget.style.boxShadow = 'var(--shadow)'; e.currentTarget.style.transform = ''; }}
              onClick={() => navigate(`/clients/${c.id}`)}>
              <div style={{ padding: '16px 18px 14px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
                  <div style={{
                    width: 38, height: 38, borderRadius: 10, flexShrink: 0,
                    background: ['linear-gradient(135deg,#3B82F6,#6366F1)', 'linear-gradient(135deg,#8B5CF6,#EC4899)', 'linear-gradient(135deg,#10B981,#3B82F6)', 'linear-gradient(135deg,#F59E0B,#EF4444)'][i % 4],
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#fff', fontSize: 16, fontWeight: 800,
                  }}>
                    {c.name.charAt(0).toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</div>
                    {c.industry && <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>{c.industry}</div>}
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); handleDelete(c.id, c.name); }}
                    style={{ padding: 4, borderRadius: 6, background: 'none', color: 'var(--text3)', border: 'none', cursor: 'pointer', opacity: 0, transition: 'opacity .15s' }}
                    onMouseEnter={e => { e.currentTarget.style.color = 'var(--danger)'; e.currentTarget.style.opacity = '1'; }}
                    onMouseLeave={e => { e.currentTarget.style.opacity = '0'; }}
                    className="delete-btn">
                    <Trash2 size={13} />
                  </button>
                </div>

                <div style={{ display: 'flex', gap: 12, fontSize: 11, color: 'var(--text2)' }}>
                  <div><span style={{ color: 'var(--text3)' }}>Reports:</span> {c.report_count || 0}</div>
                  {c.last_report_month && (
                    <div><span style={{ color: 'var(--text3)' }}>Last:</span> {new Date(c.last_report_month).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}</div>
                  )}
                </div>
              </div>
              <div style={{ padding: '10px 18px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--primary)', fontWeight: 600 }}>
                View dashboard <ArrowRight size={12} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div style={{ fontWeight: 700, fontSize: 16 }}>Add New Client</div>
              <button onClick={() => setShowModal(false)} className="btn btn-ghost btn-sm"><X size={16} /></button>
            </div>
            <form onSubmit={handleCreate}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div className="form-group">
                  <label className="form-label">Client Name *</label>
                  <input className="form-input" placeholder="Acme Corporation" value={form.name} onChange={set('name')} required />
                </div>
                <div className="grid grid-2">
                  <div className="form-group">
                    <label className="form-label">Industry</label>
                    <select className="form-select" value={form.industry} onChange={set('industry')}>
                      <option value="">Select...</option>
                      {INDUSTRIES.map(i => <option key={i}>{i}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Contact Email</label>
                    <input className="form-input" type="email" placeholder="client@example.com" value={form.contactEmail} onChange={set('contactEmail')} />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Website</label>
                  <input className="form-input" placeholder="https://example.com" value={form.website} onChange={set('website')} />
                </div>
                <div className="form-group">
                  <label className="form-label">Notes</label>
                  <textarea className="form-input" rows={2} placeholder="Any notes about this client..." value={form.notes} onChange={set('notes')} />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Creating...' : 'Create Client'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <style>{`.card:hover .delete-btn { opacity: 1 !important; }`}</style>
    </div>
  );
}
