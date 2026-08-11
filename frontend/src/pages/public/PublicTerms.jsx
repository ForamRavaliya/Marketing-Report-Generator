import React from 'react';
import PublicLayout from '../../components/public/PublicLayout';
import SEO from '../../components/public/SEO';

export default function PublicTerms() {
  return (
    <PublicLayout>
      <SEO title="Terms of Service" description="Unbrand Agency Terms of Service." path="/terms" />

      <section className="pub-hero" style={{ paddingBottom: 10 }}>
        <div className="pub-container pub-section-head">
          <h1 className="pub-h1" style={{ fontSize: 'clamp(28px,4vw,40px)' }}>Terms of Service</h1>
          <p className="pub-body" style={{ marginTop: 10 }}>Last updated: this is a draft and has not yet been dated for publication.</p>
        </div>
      </section>

      <section className="pub-section" style={{ paddingTop: 10 }}>
        <div className="pub-container pub-doc">
          <div className="pub-notice">
            This is a baseline draft appropriate to Unbrand Agency's current functionality. It has not been
            reviewed by a lawyer and must not be treated as final or legally binding until it receives
            owner/legal review before public launch.
          </div>

          <h2>1. Using Unbrand Agency</h2>
          <p>
            Unbrand Agency is performance marketing reporting software. By creating an account, you agree to
            use it in accordance with these terms.
          </p>

          <h2>2. Accounts</h2>
          <p>
            You are responsible for the accuracy of the information you provide and for maintaining the
            security of your account credentials. Access within an agency account is controlled by the
            roles (admin, analyst, viewer) assigned by your agency's administrator.
          </p>

          <h2>3. Your data</h2>
          <p>
            You retain ownership of the campaign data you upload. You are responsible for having the
            right to upload and process that data through Unbrand Agency.
          </p>

          <h2>4. Subscriptions and payment</h2>
          <p>
            Free, Pro and Agency plans are described on the Pricing page. Paid subscriptions are billed
            through Razorpay. Plan limits (such as client counts and monthly report generation) are
            enforced as described on the Pricing page and may change with notice.
          </p>

          <h2>5. Acceptable use</h2>
          <p>
            You agree not to use Unbrand Agency to upload unlawful content, attempt to disrupt the service,
            or access data belonging to another agency account.
          </p>

          <h2>6. Availability</h2>
          <p>
            We aim to keep Unbrand Agency available and reliable, but do not guarantee uninterrupted access.
            Features described as "Coming Soon" are not yet available and are not covered by these
            terms until launched.
          </p>

          <h2>7. Termination</h2>
          <p>
            You may stop using Unbrand Agency and request account deletion at any time. We may suspend
            accounts that violate these terms.
          </p>

          <h2>8. Changes to these terms</h2>
          <p>We may update these terms as the product changes. Material changes will be reflected on this page.</p>

          <h2>9. Contact</h2>
          <p>Questions about these terms can be sent via the Contact page.</p>
        </div>
      </section>
    </PublicLayout>
  );
}
