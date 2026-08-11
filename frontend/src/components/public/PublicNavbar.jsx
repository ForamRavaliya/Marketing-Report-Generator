import React, { useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { BarChart3, Menu, X } from 'lucide-react';

const LINKS = [
  { to: '/features', label: 'Product / Features' },
  { to: '/how-it-works', label: 'How It Works' },
  { to: '/reporting', label: 'Reports' },
  { to: '/pricing', label: 'Pricing' },
  { to: '/about', label: 'About' },
  { to: '/faq', label: 'FAQ' },
];

export default function PublicNavbar() {
  const [open, setOpen] = useState(false);

  return (
    <header className="pub-nav">
      <div className="pub-container pub-nav-inner">
        <Link to="/" className="pub-logo" onClick={() => setOpen(false)}>
          <span className="pub-logo-mark"><BarChart3 size={18} /></span>
          Unbrand Agency
        </Link>

        <nav className="pub-nav-links">
          {LINKS.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) => `pub-nav-link${isActive ? ' active' : ''}`}
            >
              {link.label}
            </NavLink>
          ))}
        </nav>

        <div className="pub-nav-actions">
          <Link to="/login" className="pub-btn pub-btn-secondary pub-btn-sm">Login</Link>
          <Link to="/register" className="pub-btn pub-btn-primary pub-btn-sm">Get Started</Link>
          <button
            type="button"
            className="pub-nav-toggle"
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </div>

      <div className={`pub-container pub-mobile-menu${open ? ' open' : ''}`}>
        {LINKS.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            className={({ isActive }) => `pub-nav-link${isActive ? ' active' : ''}`}
            onClick={() => setOpen(false)}
          >
            {link.label}
          </NavLink>
        ))}
        <Link to="/login" className="pub-nav-link" onClick={() => setOpen(false)} style={{ paddingTop: 12 }}>
          Login
        </Link>
      </div>
    </header>
  );
}
