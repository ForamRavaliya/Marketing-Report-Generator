import React, { useState, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import { getClients, uploadFile, manualEntry, getUploads } from '../utils/api';
import toast from 'react-hot-toast';
import { Upload, FileText, Image, Table, CheckCircle, Clock, XCircle, Plus, Pencil } from 'lucide-react';

const PLATFORMS = ['meta', 'google', 'linkedin', 'twitter', 'tiktok', 'other'];

const fileIcon = (type) => {
  if (type === 'image') return <Image size={14} />;
  if (type === 'pdf') return <FileText size={14} />;
  return <Table size={14} />;
};

const statusBadge = (status) => {
  const map = {
    completed: { label: 'Extracted', cls: 'badge-green', icon: <CheckCircle size={10} /> },
    processing: { label: 'Processing', cls: 'badge-yellow', icon: <Clock size={10} /> },
    pending: { label: 'Pending', cls: 'badge-gray', icon: <Clock size={10} /> },
    failed: { label: 'Failed', cls: 'badge-red', icon: <XCircle size={10} /> },
  };
  const s = map[status] || map.pending;
  return <span className={`badge ${s.cls}`}>{s.icon} {s.label}</span>;
};

export default function UploadData() {
  const [clients, setClients] = useState([]);
  const [selectedClient, setSelectedClient] = useState('');
  const [platform, setPlatform] = useState('meta');
  const [dateStart, setDateStart] = useState('');
  const [dateEnd, setDateEnd] = useState('');
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [uploads, setUploads] = useState([]);
  const [mode, setMode] = useState('file'); // 'file' | 'manual'
  const [manualForm, setManualForm] = useState({ spend: '', impressions: '', clicks: '', ctr: '', cpc: '', conversions: '', cpa: '', roas: '', revenue: '', campaignName: '' });

  useEffect(() => {
    getClients().then(setClients).catch(() => {});
  }, []);

  useEffect(() => {
    if (selectedClient) {
      getUploads(selectedClient).then(setUploads).catch(() => {});
    }
  }, [selectedClient]);

  const { getRootProps, getInputProps, isDragActive, acceptedFiles } = useDropzone({
    accept: { 'text/csv': ['.csv'], 'application/vnd.ms-excel': ['.xls'], 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'], 'application/pdf': ['.pdf'], 'image/png': ['.png'], 'image/jpeg': ['.jpg', '.jpeg'] },
    maxFiles: 1,
    maxSize: 50 * 1024 * 1024,
  });

  const handleUpload = async () => {
    if (!selectedClient) { toast.error('Please select a client'); return; }
    if (!acceptedFiles.length) { toast.error('Please select a file'); return; }

    setUploading(true);
    setProgress(0);
    const fd = new FormData();
    fd.append('file', acceptedFiles[0]);
    fd.append('clientId', selectedClient);
    fd.append('platform', platform);
    if (dateStart) fd.append('dateRangeStart', dateStart);
    if (dateEnd) fd.append('dateRangeEnd', dateEnd);

    try {
      const result = await uploadFile(fd, setProgress);
      toast.success('File uploaded! Extraction in progress...');
      setUploads(prev => [{ id: result.uploadId, file_name: acceptedFiles[0].name, file_type: result.fileType, extraction_status: 'processing', created_at: new Date().toISOString(), platform }, ...prev]);

      // Poll status
      const poll = setInterval(async () => {
        const status = await getUploads(selectedClient);
        setUploads(status);
        if (status[0]?.extraction_status !== 'processing') {
          clearInterval(poll);
          if (status[0]?.extraction_status === 'completed') toast.success('Data extraction complete!');
          else if (status[0]?.extraction_status === 'failed') toast.error('Extraction failed. Check file format.');
        }
      }, 2000);
      setTimeout(() => clearInterval(poll), 30000);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Upload failed');
    } finally {
      setUploading(false);
      setProgress(0);
    }
  };

  const setM = (k) => (e) => setManualForm(f => ({ ...f, [k]: e.target.value }));

  const handleManual = async () => {
    if (!selectedClient) { toast.error('Please select a client'); return; }
    if (!dateStart) { toast.error('Please select a report month'); return; }
    try {
      await manualEntry({
        clientId: selectedClient, platform,
        reportMonth: dateStart,
        campaignName: manualForm.campaignName || undefined,
        metrics: Object.fromEntries(Object.entries(manualForm).filter(([k]) => k !== 'campaignName').map(([k, v]) => [k, parseFloat(v) || 0])),
      });
      toast.success('Data saved!');
      setManualForm({ spend: '', impressions: '', clicks: '', ctr: '', cpc: '', conversions: '', cpa: '', roas: '', revenue: '', campaignName: '' });
      if (selectedClient) getUploads(selectedClient).then(setUploads);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to save');
    }
  };

  return (
    <div className="fade-in">
      <div className="page-header">
        <div className="page-title">Upload Data</div>
        <div className="page-subtitle">Import ad performance data from files or enter manually</div>
      </div>

      <div className="grid grid-2" style={{ gap: 20, alignItems: 'start' }}>
        {/* Left: Config + Upload */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Config card */}
          <div className="card card-pad">
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 16 }}>Configuration</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="form-group">
                <label className="form-label">Client *</label>
                <select className="form-select" value={selectedClient} onChange={e => setSelectedClient(e.target.value)}>
                  <option value="">Select client...</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Platform *</label>
                <select className="form-select" value={platform} onChange={e => setPlatform(e.target.value)}>
                  {PLATFORMS.map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)} {p === 'meta' ? 'Ads' : p === 'google' ? 'Ads' : ''}</option>)}
                </select>
              </div>
              <div className="grid grid-2">
                <div className="form-group">
                  <label className="form-label">Date From</label>
                  <input type="date" className="form-input" value={dateStart} onChange={e => setDateStart(e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Date To</label>
                  <input type="date" className="form-input" value={dateEnd} onChange={e => setDateEnd(e.target.value)} />
                </div>
              </div>
            </div>
          </div>

          {/* Mode toggle */}
          <div style={{ display: 'flex', background: 'var(--bg3)', padding: 4, borderRadius: 10, gap: 4 }}>
            {[{ id: 'file', icon: <Upload size={13} />, label: 'Upload File' }, { id: 'manual', icon: <Pencil size={13} />, label: 'Manual Entry' }].map(({ id, icon, label }) => (
              <button key={id} onClick={() => setMode(id)} style={{
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                padding: '7px 12px', borderRadius: 8, fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer',
                background: mode === id ? 'var(--bg2)' : 'transparent',
                color: mode === id ? 'var(--text)' : 'var(--text2)',
                boxShadow: mode === id ? 'var(--shadow)' : 'none',
                transition: 'all .15s',
              }}>
                {icon} {label}
              </button>
            ))}
          </div>

          {mode === 'file' ? (
            <div className="card card-pad">
              {/* Dropzone */}
              <div {...getRootProps()} style={{
                border: `2px dashed ${isDragActive ? 'var(--primary)' : 'var(--border2)'}`,
                borderRadius: 10, padding: '28px 20px', textAlign: 'center', cursor: 'pointer',
                background: isDragActive ? 'var(--primary-light)' : 'var(--bg3)',
                transition: 'all .15s', marginBottom: 14,
              }}>
                <input {...getInputProps()} />
                <Upload size={28} style={{ margin: '0 auto 10px', color: isDragActive ? 'var(--primary)' : 'var(--text3)' }} />
                <div style={{ fontWeight: 600, marginBottom: 4, color: isDragActive ? 'var(--primary)' : 'var(--text)' }}>
                  {isDragActive ? 'Drop file here' : 'Drag & drop or click to upload'}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text3)' }}>CSV, Excel, PDF, PNG, JPG • Max 50MB</div>
              </div>

              {acceptedFiles.length > 0 && (
                <div style={{ padding: '10px 12px', background: 'var(--success-light)', borderRadius: 8, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <CheckCircle size={14} color="var(--success)" />
                  <span style={{ fontSize: 13, color: 'var(--success)', fontWeight: 600 }}>{acceptedFiles[0].name}</span>
                  <span style={{ fontSize: 11, color: 'var(--text3)', marginLeft: 'auto' }}>{(acceptedFiles[0].size / 1024).toFixed(0)} KB</span>
                </div>
              )}

              {uploading && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ height: 4, background: 'var(--border)', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${progress}%`, background: 'var(--primary)', transition: 'width .3s', borderRadius: 4 }} />
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4, textAlign: 'center' }}>{progress}% uploaded</div>
                </div>
              )}

              <button className="btn btn-primary" onClick={handleUpload} disabled={uploading || !acceptedFiles.length || !selectedClient} style={{ width: '100%', justifyContent: 'center' }}>
                {uploading ? <><span className="spin" style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,.3)', borderTopColor: '#fff', borderRadius: '50%', display: 'inline-block' }} /> Processing...</> : <><Upload size={14} /> Upload & Extract</>}
              </button>

              <div style={{ marginTop: 12, fontSize: 11, color: 'var(--text3)', textAlign: 'center' }}>
                Supports Meta Ads, Google Ads exports • OCR for screenshots
              </div>
            </div>
          ) : (
            <div className="card card-pad">
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 14 }}>Enter Metrics Manually</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div className="form-group">
                  <label className="form-label">Campaign Name (optional)</label>
                  <input className="form-input" placeholder="Summer Sale 2024" value={manualForm.campaignName} onChange={setM('campaignName')} />
                </div>
                <div className="grid grid-2">
                  {[
                    { key: 'spend', label: 'Spend ($)', ph: '1500.00' },
                    { key: 'impressions', label: 'Impressions', ph: '50000' },
                    { key: 'clicks', label: 'Clicks', ph: '1200' },
                    { key: 'ctr', label: 'CTR (%)', ph: '2.4' },
                    { key: 'cpc', label: 'CPC ($)', ph: '1.25' },
                    { key: 'conversions', label: 'Conversions', ph: '85' },
                    { key: 'cpa', label: 'CPA ($)', ph: '17.65' },
                    { key: 'roas', label: 'ROAS', ph: '3.2' },
                    { key: 'revenue', label: 'Revenue ($)', ph: '4800' },
                  ].map(({ key, label, ph }) => (
                    <div key={key} className="form-group">
                      <label className="form-label">{label}</label>
                      <input className="form-input" type="number" step="0.01" placeholder={ph} value={manualForm[key]} onChange={setM(key)} />
                    </div>
                  ))}
                </div>
                <button className="btn btn-primary" onClick={handleManual} disabled={!selectedClient} style={{ justifyContent: 'center' }}>
                  <Plus size={14} /> Save Data
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Right: Recent Uploads */}
        <div className="card">
          <div className="card-pad" style={{ borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>Recent Uploads</div>
            {selectedClient && <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>For selected client</div>}
          </div>
          {!selectedClient ? (
            <div style={{ padding: '40px 24px', textAlign: 'center', color: 'var(--text3)' }}>
              Select a client to see upload history
            </div>
          ) : uploads.length === 0 ? (
            <div style={{ padding: '40px 24px', textAlign: 'center', color: 'var(--text3)' }}>
              No uploads yet for this client
            </div>
          ) : (
            <div>
              {uploads.map(u => (
                <div key={u.id} style={{ padding: '12px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--bg3)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text2)', flexShrink: 0 }}>
                    {fileIcon(u.file_type)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.file_name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2, display: 'flex', gap: 8 }}>
                      <span style={{ textTransform: 'capitalize' }}>{u.platform || 'N/A'}</span>
                      <span>{new Date(u.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                  {statusBadge(u.extraction_status)}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
