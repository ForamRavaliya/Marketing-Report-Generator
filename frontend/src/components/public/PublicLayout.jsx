import React from 'react';
import '../../publicSite.css';
import PublicNavbar from './PublicNavbar';
import PublicFooter from './PublicFooter';

export default function PublicLayout({ children }) {
  return (
    <div className="public-site">
      <PublicNavbar />
      <main>{children}</main>
      <PublicFooter />
    </div>
  );
}
