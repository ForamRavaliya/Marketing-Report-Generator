import React, { useEffect, useState } from 'react';
import api from '../utils/api';

export default function SuperAdminDashboard() {
  const [data, setData] = useState(null);

  useEffect(() => {
    api
      .get('/super-admin/overview')
      .then((res) => setData(res.data))
      .catch(console.error);
  }, []);

  if (!data) {
    return <div>Loading...</div>;
  }

  const { totals, recentAgencies, planStats } = data;

  return (
    <div>
      <h1 style={{ marginBottom: 24 }}>
        Super Admin Dashboard
      </h1>

      <div
        className="grid grid-4"
        style={{ marginBottom: 30 }}
      >
        <div className="card card-pad">
          <h3>Agencies</h3>
          <h2>{totals.agencies}</h2>
        </div>

        <div className="card card-pad">
          <h3>Clients</h3>
          <h2>{totals.clients}</h2>
        </div>

        <div className="card card-pad">
          <h3>Reports</h3>
          <h2>{totals.reports}</h2>
        </div>

        <div className="card card-pad">
          <h3>Users</h3>
          <h2>{totals.users}</h2>
        </div>
      </div>

      <div className="card card-pad">
        <h3>Recent Agencies</h3>

        <table style={{ width: '100%' }}>
          <thead>
            <tr>
              <th>Name</th>
              <th>Clients</th>
              <th>Users</th>
            </tr>
          </thead>

          <tbody>
            {recentAgencies.map((agency) => (
              <tr key={agency.id}>
                <td>{agency.name}</td>
                <td>{agency.clients_count}</td>
                <td>{agency.users_count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div
        className="card card-pad"
        style={{ marginTop: 24 }}
      >
        <h3>Plans Distribution</h3>

        {planStats.map((plan) => (
          <div
            key={plan.plan_name}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              padding: '10px 0',
            }}
          >
            <span>{plan.plan_name}</span>
            <strong>{plan.total}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}