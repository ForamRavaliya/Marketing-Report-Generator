import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import PublicLayout from '../../components/public/PublicLayout';
import SEO from '../../components/public/SEO';

export default function PublicNotFound() {
  return (
    <PublicLayout>
      <SEO title="Page Not Found" description="The page you're looking for doesn't exist." path="/404" />
      <section className="pub-hero" style={{ textAlign: 'center' }}>
        <div className="pub-container">
          <h1 className="pub-h1">404</h1>
          <p className="pub-lede" style={{ margin: '18px auto 0' }}>
            We couldn't find that page. It may have moved, or the address may be incorrect.
          </p>
          <div className="pub-hero-cta-row" style={{ justifyContent: 'center' }}>
            <Link to="/" className="pub-btn pub-btn-primary">
              Back to Home <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
