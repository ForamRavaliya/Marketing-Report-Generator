import React from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

export const MetricCard = ({ label, value, change, icon: Icon, color = '#2563EB', prefix = '', suffix = '', subtitle }) => {
  const isPositive = change > 0;
  const isNegative = change < 0;

  return (
    <div className="card card-pad fade-in" style={{ position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: color, borderRadius: '14px 14px 0 0' }} />
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.04em' }}>{label}</div>
        {Icon && (
          <div style={{ width: 32, height: 32, borderRadius: 8, background: `${color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon size={15} color={color} />
          </div>
        )}
      </div>
      <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--text)', lineHeight: 1.1, marginBottom: 6 }}>
        {prefix}{value}{suffix}
      </div>
      {subtitle && <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 4 }}>{subtitle}</div>}
      {change !== undefined && change !== null && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600 }}>
          {isPositive ? <TrendingUp size={12} color="var(--success)" /> : isNegative ? <TrendingDown size={12} color="var(--danger)" /> : <Minus size={12} color="var(--text3)" />}
          <span style={{ color: isPositive ? 'var(--success)' : isNegative ? 'var(--danger)' : 'var(--text3)' }}>
            {isPositive ? '+' : ''}{parseFloat(change).toFixed(1)}%
          </span>
          <span style={{ color: 'var(--text3)', fontWeight: 400 }}>vs last month</span>
        </div>
      )}
    </div>
  );
};

export const StatRow = ({ label, value, sub }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
    <div>
      <div style={{ fontSize: 13, color: 'var(--text)' }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--text3)' }}>{sub}</div>}
    </div>
    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{value}</div>
  </div>
);

export default MetricCard;
