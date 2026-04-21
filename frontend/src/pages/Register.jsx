import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import { BarChart3 } from 'lucide-react';

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '', fullName: '', agencyName: '' });
  const [loading, setLoading] = useState(false);

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (form.password.length < 6) { toast.error('Password must be at least 6 characters'); return; }
    setLoading(true);
    try {
      await register(form);
      toast.success('Account created!');
      navigate('/dashboard');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 50%, #0F172A 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ width: '100%', maxWidth: 440 }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ width: 52, height: 52, background: 'linear-gradient(135deg,#3B82F6,#8B5CF6)', borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
            <BarChart3 size={24} color="#fff" />
          </div>
          <h1 style={{ color: '#fff', fontSize: 24, fontWeight: 800 }}>AdInsight</h1>
          <p style={{ color: 'rgba(255,255,255,.5)', fontSize: 13, marginTop: 4 }}>Create your agency account</p>
        </div>

        <div style={{ background: '#fff', borderRadius: 16, padding: '32px 36px', boxShadow: '0 25px 50px rgba(0,0,0,.4)' }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 24 }}>Get started free</h2>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="form-group">
              <label className="form-label">Agency Name</label>
              <input className="form-input" placeholder="Your Digital Agency" value={form.agencyName} onChange={set('agencyName')} required />
            </div>
            <div className="form-group">
              <label className="form-label">Your Full Name</label>
              <input className="form-input" placeholder="Jane Smith" value={form.fullName} onChange={set('fullName')} required />
            </div>
            <div className="form-group">
              <label className="form-label">Email Address</label>
              <input className="form-input" type="email" placeholder="jane@agency.com" value={form.email} onChange={set('email')} required />
            </div>
            <div className="form-group">
              <label className="form-label">Password</label>
              <input className="form-input" type="password" placeholder="At least 6 characters" value={form.password} onChange={set('password')} required />
            </div>

            <button type="submit" disabled={loading} className="btn btn-primary btn-lg"
              style={{ justifyContent: 'center', marginTop: 4 }}>
              {loading ? (
                <span className="spin" style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,.3)', borderTopColor: '#fff', borderRadius: '50%', display: 'inline-block' }} />
              ) : 'Create Account'}
            </button>
          </form>

          <div style={{ textAlign: 'center', marginTop: 20, fontSize: 13, color: 'var(--text2)' }}>
            Already have an account?{' '}
            <Link to="/login" style={{ color: 'var(--primary)', fontWeight: 600 }}>Sign in</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
