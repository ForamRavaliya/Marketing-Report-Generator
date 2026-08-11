import React, { useEffect, useState } from 'react';
import { getAgency, updateAgency } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useBrandTheme } from '../context/BrandThemeContext';
import { REPORT_THEME_NAMES, REPORT_THEMES } from '../theme/reportThemes';
import toast from 'react-hot-toast';
import { Upload, Palette, Building2, Monitor, Sun, Moon, FileText, Check } from 'lucide-react';

const UI_THEME_OPTIONS = [
  { value: 'system', label: 'System', icon: Monitor },
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
];

// Swatch grid for the 5 named report themes -- click previews instantly
// (both this page's own accent colors and the rest of the app update live,
// since BrandThemeContext applies CSS vars immediately), Save persists it.
const ReportThemeGrid = ({ value, previewValue, onSelect, disabled }) => (
  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10 }}>
    {REPORT_THEME_NAMES.map((name) => {
      const theme = REPORT_THEMES[name];
      const isSelected = (previewValue || value) === name;
      const isSaved = value === name;
      return (
        <button
          key={name}
          type="button"
          role="radio"
          aria-checked={isSelected}
          disabled={disabled}
          onClick={() => !disabled && onSelect(name)}
          style={{
            textAlign: 'left',
            padding: 10,
            borderRadius: 10,
            border: `1.5px solid ${isSelected ? 'var(--primary)' : 'var(--border)'}`,
            background: 'var(--bg2)',
            cursor: disabled ? 'not-allowed' : 'pointer',
            opacity: disabled ? 0.6 : 1,
            transition: 'all .15s',
            position: 'relative',
          }}
        >
          {isSelected && (
            <div style={{ position: 'absolute', top: 8, right: 8, width: 18, height: 18, borderRadius: '50%', background: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Check size={11} color="#fff" strokeWidth={3} />
            </div>
          )}
          <div style={{ height: 28, borderRadius: 6, marginBottom: 8, background: `linear-gradient(135deg, ${theme.swatch[0]}, ${theme.swatch[1]})` }} />
          <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text)' }}>{theme.label}</div>
          <div style={{ fontSize: 10.5, color: 'var(--text3)', marginTop: 2, lineHeight: 1.3 }}>{theme.description}</div>
          {isSaved && !previewValue && (
            <div style={{ fontSize: 9.5, color: 'var(--success)', fontWeight: 700, marginTop: 6, textTransform: 'uppercase', letterSpacing: '.04em' }}>Active</div>
          )}
        </button>
      );
    })}
  </div>
);

const SegmentedControl = ({ options, value, onChange, disabled }) => (
  <div
    role="radiogroup"
    style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}
  >
    {options.map((opt) => {
      const Icon = opt.icon;
      const selected = value === opt.value;
      return (
        <button
          key={opt.value}
          type="button"
          role="radio"
          aria-checked={selected}
          disabled={disabled}
          onClick={() => !disabled && onChange(opt.value)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '8px 14px',
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 600,
            cursor: disabled ? 'not-allowed' : 'pointer',
            border: `1.5px solid ${selected ? 'var(--primary)' : 'var(--border)'}`,
            background: selected ? 'var(--primary-light)' : 'var(--bg2)',
            color: selected ? 'var(--primary)' : 'var(--text2)',
            opacity: disabled ? 0.6 : 1,
            transition: 'all .15s',
          }}
        >
          {Icon && <Icon size={14} />}
          {opt.label}
        </button>
      );
    })}
  </div>
);

export default function Settings() {
  const { user } = useAuth();
  const { uiTheme, setUiTheme } = useTheme();
  const { savedTheme, activeTheme, isPreviewing, preview, cancelPreview, saveTheme } = useBrandTheme();
  const [agency, setAgency] = useState(null);
  const [form, setForm] = useState({ name: '', primaryColor: '#2563EB', secondaryColor: '#7C3AED' });
  const [logo, setLogo] = useState(null);
  const [logoPreview, setLogoPreview] = useState(null);
  const [saving, setSaving] = useState(false);
  const [savingReportTheme, setSavingReportTheme] = useState(false);
  const isAdmin = user?.role === 'admin';

  useEffect(() => {
    getAgency().then(a => {
         console.log("Agency Data:", a);
      setAgency(a);
      setForm({
        name: a.name || '',
        primaryColor: a.primary_color || '#2563EB',
        secondaryColor: a.secondary_color || '#7C3AED'
      });

     if (a.logo_url) {
       setLogoPreview(`${a.logo_url}?t=${Date.now()}`);
     }
    }).catch((err) => {
      console.error('Failed to load agency:', err);
    });
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

    const updatedAgency = await updateAgency(fd);

    setAgency(updatedAgency);

   if (updatedAgency.logo_url) {
     setLogoPreview(`${updatedAgency.logo_url}?t=${Date.now()}`);
   }

    setLogo(null);
    toast.success('Settings saved!');
  } catch (err) {
    toast.error(err.response?.data?.error || 'Failed to save');
  } finally {
    setSaving(false);
  }
};

  const handleReportThemeSelect = (name) => {
    if (!isAdmin || savingReportTheme) return;
    preview(name); // applies instantly across the whole app, not yet saved
  };

  const handleReportThemeSave = async () => {
    setSavingReportTheme(true);
    await saveTheme();
    setSavingReportTheme(false);
  };

  return (
    <div className="fade-in">
      <div className="page-header">
        <div className="page-title">Settings</div>
        <div className="page-subtitle">Manage your agency branding and preferences</div>
      </div>

      <div style={{ maxWidth: 600, display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* Appearance */}
        <div className="card card-pad">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
            <Monitor size={16} color="var(--primary)" />
            <div style={{ fontWeight: 700, fontSize: 14 }}>Appearance</div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div className="form-group">
              <label className="form-label">UI Theme</label>
              <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 4 }}>
                Affects the application for you only.
              </div>
              <SegmentedControl options={UI_THEME_OPTIONS} value={uiTheme} onChange={setUiTheme} />
            </div>

            <div className="form-group">
              <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <FileText size={13} /> Report Theme
              </label>
              <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 4 }}>
                Applies to both the app's accent/chart colors and newly generated PDF reports for
                your agency. Existing generated PDFs are not retroactively changed.
                {!isAdmin && ' Only an agency admin can change this.'}
              </div>

              <ReportThemeGrid
                value={savedTheme}
                previewValue={isPreviewing ? activeTheme : null}
                onSelect={handleReportThemeSelect}
                disabled={!isAdmin || savingReportTheme}
              />

              {isPreviewing && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12, padding: '10px 12px', background: 'var(--primary-light)', borderRadius: 8, border: '1px solid var(--border)' }}>
                  <span style={{ fontSize: 12, color: 'var(--text2)', flex: 1 }}>
                    Previewing <strong>{REPORT_THEMES[activeTheme].label}</strong> -- not saved yet.
                  </span>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={cancelPreview}
                    disabled={savingReportTheme}
                  >
                    Revert
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={handleReportThemeSave}
                    disabled={savingReportTheme}
                  >
                    {savingReportTheme ? 'Saving...' : 'Save Theme'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

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
