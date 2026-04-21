import React, { useEffect, useState } from 'react';
import { getAgency, updateAgency } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import { Upload, Palette, Building2 } from 'lucide-react';

export default function Settings() {
  const { user } = useAuth();
  const [agency, setAgency] = useState(null);
  const [form, setForm] = useState({ name: '', primaryColor: '#2563EB', secondaryColor: '#7C3AED' });
  const [logo, setLogo] = useState(null);
  const [logoPreview, setLogoPreview] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getAgency().then(a => {
      setAgency(a);
      setForm({ name: a.name || '', primaryColor: a.primary_color || '#2563EB', secondaryColor: a.secondary_color || '#7C3AED' });
      if (a.logo_url) setLogoPreview(`http://localhost:5000${a.logo_url}`);
    }).catch(() => {});
  }, []);

  const handleLogoChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setLogo(file);
    setLogoPreview(URL.createObjectURL(file));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append('name', form.name);
      fd.append('primaryColor', form.primaryColor);
      fd.append('secondaryColor', form.secondaryColor);
      if (logo) fd.append('logo', logo);
      await updateAgency(fd);
      toast.success('Settings saved!');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fade-in">
      <div className="page-header">
        <div className="page-title">Settings</div>
        <div className="page-subtitle">Manage your agency branding and preferences</div>
      </div>

      <div style={{ maxWidth: 600, display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* Agency Info */}
        <div className="card card-pad">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
            <Building2 size={16} color="var(--primary)" />
            <div style={{ fontWeight: 700, fontSize: 14 }}>Agency Information</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="form-group">
              <label className="form-label">Agency Name</label>
              <input className="form-input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Your Agency Name" />
            </div>
            <div style={{ padding: '10px 14px', background: 'var(--bg3)', borderRadius: 8, fontSize: 12, color: 'var(--text2)' }}>
              <strong>Account:</strong> {user?.email} · <strong>Role:</strong> {user?.role}
            </div>
          </div>
        </div>

        {/* Logo */}
        <div className="card card-pad">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
            <Upload size={16} color="var(--primary)" />
            <div style={{ fontWeight: 700, fontSize: 14 }}>Agency Logo</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ width: 72, height: 72, borderRadius: 12, border: '2px dashed var(--border2)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0, background: 'var(--bg3)' }}>
              {logoPreview ? (
                <img src={logoPreview} alt="logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
              ) : (
                <Upload size={20} color="var(--text3)" />
              )}
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 16px', background: 'var(--bg3)', border: '1.5px solid var(--border)', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                <Upload size={13} /> Choose Logo
                <input type="file" accept="image/*" onChange={handleLogoChange} style={{ display: 'none' }} />
              </label>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 6 }}>PNG, JPG up to 5MB. Used in PDF reports.</div>
            </div>
          </div>
        </div>

        {/* Brand Colors */}
        <div className="card card-pad">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
            <Palette size={16} color="var(--primary)" />
            <div style={{ fontWeight: 700, fontSize: 14 }}>Brand Colors</div>
          </div>
          <div className="grid grid-2">
            <div className="form-group">
              <label className="form-label">Primary Color</label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input type="color" value={form.primaryColor} onChange={e => setForm(f => ({ ...f, primaryColor: e.target.value }))}
                  style={{ width: 40, height: 36, padding: 2, border: '1.5px solid var(--border)', borderRadius: 8, cursor: 'pointer' }} />
                <input className="form-input" value={form.primaryColor} onChange={e => setForm(f => ({ ...f, primaryColor: e.target.value }))}
                  style={{ flex: 1, fontFamily: 'var(--mono)', fontSize: 13 }} maxLength={7} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Secondary Color</label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input type="color" value={form.secondaryColor} onChange={e => setForm(f => ({ ...f, secondaryColor: e.target.value }))}
                  style={{ width: 40, height: 36, padding: 2, border: '1.5px solid var(--border)', borderRadius: 8, cursor: 'pointer' }} />
                <input className="form-input" value={form.secondaryColor} onChange={e => setForm(f => ({ ...f, secondaryColor: e.target.value }))}
                  style={{ flex: 1, fontFamily: 'var(--mono)', fontSize: 13 }} maxLength={7} />
              </div>
            </div>
          </div>

          {/* Preview */}
          <div style={{ marginTop: 16, padding: '14px 16px', borderRadius: 10, background: form.primaryColor, color: '#fff' }}>
            <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 2 }}>Report header preview</div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>{form.name || 'Your Agency'}</div>
            <div style={{ marginTop: 6, display: 'inline-block', padding: '2px 10px', background: form.secondaryColor, borderRadius: 20, fontSize: 11 }}>
              Prepared by {form.name || 'Your Agency'}
            </div>
          </div>
        </div>

        <button className="btn btn-primary btn-lg" onClick={handleSave} disabled={saving} style={{ width: 'fit-content' }}>
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>
    </div>
  );
}
