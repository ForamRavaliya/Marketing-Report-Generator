import React from 'react';
import { Link } from 'react-router-dom';
import { BarChart3 } from 'lucide-react';

export default function PublicFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="pub-footer">
      <div className="pub-container">
        <div className="pub-footer-grid">
          <div className="pub-footer-col">
            <div className="pub-logo" style={{ marginBottom: 14 }}>
              <span className="pub-logo-mark"><BarChart3 size={18} /></span>
              Unbrand Agency
            </div>
            <p style={{ maxWidth: 260 }}>
              Performance marketing reporting software for agencies and marketers.
            </p>
          </div>

          <div className="pub-footer-col">
            <h4>Product</h4>
            <Link to="/features">Features</Link>
            <Link to="/reporting">Reports</Link>
            <Link to="/pricing">Pricing</Link>
            <Link to="/how-it-works">How It Works</Link>
          </div>

          <div className="pub-footer-col">
            <h4>Company</h4>
            <Link to="/about">About</Link>
            <Link to="/contact">Contact</Link>
          </div>

          <div className="pub-footer-col">
            <h4>Resources</h4>
            <Link to="/faq">FAQ</Link>
            <Link to="/security">Security</Link>
          </div>

          <div className="pub-footer-col">
            <h4>Legal</h4>
            <Link to="/privacy">Privacy</Link>
            <Link to="/terms">Terms</Link>
          </div>
        </div>

        <div className="pub-footer-bottom">
          <span>© {year} Unbrand Agency. All rights reserved.</span>
          <div style={{ display: 'flex', gap: 18 }}>
            <Link to="/login" style={{ color: 'var(--text2)' }}>Login</Link>
            <Link to="/register" style={{ color: 'var(--primary)', fontWeight: 700 }}>Get Started</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
