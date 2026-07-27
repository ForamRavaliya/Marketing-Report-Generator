/*import { useEffect, useMemo, useState } from 'react';
import {
  getIntegrations,
  demoConnectIntegration,
  syncIntegration,
  getIntegrationLogs,
  getClients,
} from '../utils/api';

const platformConfig = [
  {
    key: 'meta',
    name: 'Meta Ads',
    description: 'Sync Facebook and Instagram campaign data.',
    icon: 'f',
    accent: 'from-blue-500 to-indigo-600',
    soft: 'bg-blue-50',
    text: 'text-blue-700',
  },
  {
    key: 'google',
    name: 'Google Ads',
    description: 'Sync Search, Display and YouTube ads data.',
    icon: 'G',
    accent: 'from-emerald-500 to-teal-600',
    soft: 'bg-emerald-50',
    text: 'text-emerald-700',
  },
  {
    key: 'analytics',
    name: 'Google Analytics',
    description: 'Track sessions, users and traffic sources.',
    icon: 'A',
    accent: 'from-amber-400 to-orange-500',
    soft: 'bg-amber-50',
    text: 'text-amber-700',
  },
];

export default function Integrations() {
  const [integrations, setIntegrations] = useState([]);
  const [logs, setLogs] = useState([]);
  const [clients, setClients] = useState([]);
  const [selectedClient, setSelectedClient] = useState('');
  const [loadingKey, setLoadingKey] = useState('');
  const [message, setMessage] = useState('');

  const loadData = async () => {
    const [integrationRes, logsRes, clientsRes] = await Promise.all([
      getIntegrations(),
      getIntegrationLogs(),
      getClients(),
    ]);

    setIntegrations(integrationRes || []);
    setLogs(logsRes || []);
    setClients(clientsRes || []);

    if (!selectedClient && clientsRes?.length > 0) {
      setSelectedClient(String(clientsRes[0].id));
    }
  };

  useEffect(() => {
    loadData().catch(console.error);
  }, []);

  const clientIntegrations = useMemo(() => {
    if (!selectedClient) return integrations;
    return integrations.filter(
      (item) => String(item.client_id) === String(selectedClient)
    );
  }, [integrations, selectedClient]);

  const getConnected = (platformKey) =>
    clientIntegrations.find((item) => item.platform === platformKey);

  const handleConnect = async (platformKey) => {
    if (!selectedClient) {
      setMessage('Please select a client first.');
      return;
    }

    try {
      setLoadingKey(platformKey);
      setMessage('');

      await demoConnectIntegration({
        clientId: selectedClient,
        platform: platformKey,
      });

      await loadData();
      setMessage('Platform connected successfully.');
    } catch (err) {
      console.error(err);
      setMessage(err.response?.data?.error || 'Connection failed.');
    } finally {
      setLoadingKey('');
    }
  };

  const handleSync = async (integrationId, platformKey) => {
    try {
      setLoadingKey(platformKey);
      setMessage('');

      await syncIntegration(integrationId);

      await loadData();
      setMessage('Sync completed successfully.');
    } catch (err) {
      console.error(err);
      setMessage(err.response?.data?.error || 'Sync failed.');
    } finally {
      setLoadingKey('');
    }
  };

  const formatTime = (value) => {
    if (!value) return 'Not synced yet';
    return new Date(value).toLocaleString();
  };

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">
            Integrations
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Connect ad platforms and keep client marketing data updated.
          </p>
        </div>

        <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-500"></span>
          <span className="text-sm font-semibold text-slate-700">
            Live Data Ready
          </span>
        </div>
      </div>

      <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              Client Workspace
            </h2>
            <p className="text-sm text-slate-500">
              Select a client before connecting or syncing platforms.
            </p>
          </div>

          <select
            value={selectedClient}
            onChange={(e) => setSelectedClient(e.target.value)}
            className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none md:w-72"
          >
            <option value="">Select Client</option>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name}
              </option>
            ))}
          </select>
        </div>

        {message && (
          <div className="mt-4 rounded-xl bg-blue-50 px-4 py-3 text-sm font-medium text-blue-700">
            {message}
          </div>
        )}
      </div>

      <div className="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
        {platformConfig.map((platform) => {
          const connected = getConnected(platform.key);
          const isLoading = loadingKey === platform.key;

          return (
            <div
              key={platform.key}
              className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-lg"
            >
              <div className={`h-2 bg-gradient-to-r ${platform.accent}`}></div>

              <div className="p-6">
                <div className="mb-5 flex items-start justify-between">
                  <div className="flex items-center gap-4">
                    <div
                      className={`flex h-14 w-14 items-center justify-center rounded-2xl ${platform.soft} text-2xl font-black ${platform.text}`}
                    >
                      {platform.icon}
                    </div>

                    <div>
                      <h3 className="text-lg font-bold text-slate-900">
                        {platform.name}
                      </h3>
                      <p className="mt-1 text-xs text-slate-500">
                        {platform.description}
                      </p>
                    </div>
                  </div>

                  <span
                    className={`rounded-full px-3 py-1 text-xs font-bold ${
                      connected
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {connected ? 'Connected' : 'Available'}
                  </span>
                </div>

                {connected ? (
                  <div>
                    <div className="mb-5 space-y-3 rounded-2xl bg-slate-50 p-4">
                      <div className="flex justify-between gap-4 text-sm">
                        <span className="text-slate-500">Account</span>
                        <span className="font-semibold text-slate-800">
                          {connected.account_name || connected.account_id || 'Demo Account'}
                        </span>
                      </div>

                      <div className="flex justify-between gap-4 text-sm">
                        <span className="text-slate-500">Last Sync</span>
                        <span className="text-right font-semibold text-slate-800">
                          {formatTime(connected.last_synced_at)}
                        </span>
                      </div>

                      <div className="flex justify-between gap-4 text-sm">
                        <span className="text-slate-500">Status</span>
                        <span className="font-semibold text-emerald-600">
                          Healthy
                        </span>
                      </div>
                    </div>

                    <button
                      onClick={() => handleSync(connected.id, platform.key)}
                      disabled={isLoading}
                      className="w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-bold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      {isLoading ? 'Syncing...' : 'Sync Now'}
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => handleConnect(platform.key)}
                    disabled={isLoading}
                    className={`w-full rounded-xl bg-gradient-to-r ${platform.accent} px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-70`}
                  >
                    {isLoading ? 'Connecting...' : `Connect ${platform.name}`}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-900">
              Recent Sync Activity
            </h2>
            <p className="text-sm text-slate-500">
              Track latest platform updates and sync results.
            </p>
          </div>

          <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700">
            Live Logs
          </span>
        </div>

        <div className="space-y-4">
          {logs.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
              No sync activity yet.
            </div>
          ) : (
            logs.slice(0, 8).map((log) => (
              <div
                key={log.id}
                className="flex items-start justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4"
              >
                <div className="flex gap-4">
                  <div
                    className={`mt-1 h-3 w-3 rounded-full ${
                      log.status === 'success'
                        ? 'bg-emerald-500'
                        : 'bg-amber-500'
                    }`}
                  ></div>

                  <div>
                    <div className="font-bold text-slate-800">
                      {log.message || 'Sync activity'}
                    </div>

                    <div className="mt-1 text-sm text-slate-500">
                      {log.platform?.toUpperCase() || 'PLATFORM'} •{' '}
                      {log.synced_campaigns || log.rows_synced || 0} campaign(s) synced
                    </div>
                  </div>
                </div>

                <div className="whitespace-nowrap text-xs text-slate-400">
                  {formatTime(log.created_at)}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}*/

import { useEffect, useMemo, useState } from 'react';
import {
  disconnectIntegration,
  generateAIInsights,
  getClients,
  getIntegrationLogs,
  getIntegrations,
  startGoogleConnection,
  startLinkedInConnection,
  startMetaConnection,
  startShopifyConnection,
  syncIntegration,
} from '../utils/api';

const platforms = [
  {
    key: 'meta',
    name: 'Meta Ads',
    description: 'Connect Facebook and Instagram ad accounts.',
    available: true,
  },
  {
    key: 'google_ads',
    name: 'Google Ads',
    description: 'Search, Display and YouTube sync.',
    available: true,
  },
  {
    key: 'linkedin_ads',
    name: 'LinkedIn Ads',
    description: 'B2B campaign sync.',
    available: true,
  },
  {
    key: 'shopify',
    name: 'Shopify',
    description: 'Store revenue and order sync.',
    available: true,
  },
];

const ENABLE_PLATFORM_SYNC = process.env.REACT_APP_ENABLE_PLATFORM_SYNC === 'true';

export default function Integrations() {
  if (!ENABLE_PLATFORM_SYNC) {
    return (
      <div>
        <h1>Integrations</h1>
        <p>Platform integrations are coming soon. Manual uploads and report generation remain available.</p>
      </div>
    );
  }

  return <IntegrationsEnabled />;
}

function IntegrationsEnabled() {
  const [clients, setClients] = useState([]);
  const [connections, setConnections] = useState([]);
  const [logs, setLogs] = useState([]);
  const [selectedClient, setSelectedClient] = useState('');
  const [activeConnectionId, setActiveConnectionId] = useState('');
  const [loading, setLoading] = useState('');
  const [message, setMessage] = useState('');

  const selectedConnections = useMemo(
    () => connections.filter((connection) => String(connection.client_id) === String(selectedClient)),
    [connections, selectedClient]
  );

  const loadConnections = async () => {
    const data = await getIntegrations();
    setConnections(data || []);
    return data || [];
  };

  const loadInitial = async () => {
    const [clientRows, connectionRows] = await Promise.all([
      getClients(),
      getIntegrations(),
    ]);

    setClients(clientRows || []);
    setConnections(connectionRows || []);

    if (!selectedClient && clientRows?.[0]?.id) {
      setSelectedClient(clientRows[0].id);
    }
  };

  useEffect(() => {
    loadInitial().catch((error) => setMessage(error.response?.data?.error || 'Failed to load integrations.'));
  }, []);

  useEffect(() => {
    const first = selectedConnections[0];
    if (!first) {
      setLogs([]);
      setActiveConnectionId('');
      return;
    }

    setActiveConnectionId(first.id);
    getIntegrationLogs(first.id)
      .then(setLogs)
      .catch(() => setLogs([]));
  }, [selectedConnections]);

  const connectionFor = (platform) =>
    selectedConnections.find((connection) => connection.platform === platform && connection.status !== 'disconnected');

  const handleMetaConnect = async () => {
    if (!selectedClient) {
      setMessage('Please select a client first.');
      return;
    }

    try {
      setLoading('meta-connect');
      setMessage('');
      const result = await startMetaConnection(selectedClient);
      if (result.authUrl) {
        window.location.href = result.authUrl;
      }
    } catch (error) {
      setMessage(error.response?.data?.error || 'Meta connection failed.');
    } finally {
      setLoading('');
    }
  };

  const handleGoogleConnect = async () => {
    if (!selectedClient) {
      setMessage('Please select a client first.');
      return;
    }

    try {
      setLoading('google_ads-connect');
      setMessage('');
      const result = await startGoogleConnection(selectedClient);
      if (result.authUrl) {
        window.location.href = result.authUrl;
      }
    } catch (error) {
      setMessage(error.response?.data?.error || 'Google Ads connection failed.');
    } finally {
      setLoading('');
    }
  };

  const handleLinkedInConnect = async () => {
    if (!selectedClient) {
      setMessage('Please select a client first.');
      return;
    }

    try {
      setLoading('linkedin_ads-connect');
      setMessage('');
      const result = await startLinkedInConnection(selectedClient);
      if (result.authUrl) {
        window.location.href = result.authUrl;
      }
    } catch (error) {
      setMessage(error.response?.data?.error || 'LinkedIn Ads connection failed.');
    } finally {
      setLoading('');
    }
  };

  const handleShopifyConnect = async () => {
    if (!selectedClient) {
      setMessage('Please select a client first.');
      return;
    }

    const shop = window.prompt('Enter Shopify store domain, e.g. your-store.myshopify.com');
    if (!shop) return;

    try {
      setLoading('shopify-connect');
      setMessage('');
      const result = await startShopifyConnection(selectedClient, shop);
      if (result.authUrl) {
        window.location.href = result.authUrl;
      }
    } catch (error) {
      setMessage(error.response?.data?.error || 'Shopify connection failed.');
    } finally {
      setLoading('');
    }
  };

  const handleConnect = (platformKey) => {
    if (platformKey === 'meta') return handleMetaConnect();
    if (platformKey === 'google_ads') return handleGoogleConnect();
    if (platformKey === 'linkedin_ads') return handleLinkedInConnect();
    if (platformKey === 'shopify') return handleShopifyConnect();
    return undefined;
  };

  const handleSync = async (connection) => {
    try {
      setLoading(`sync-${connection.id}`);
      setMessage('');
      const result = await syncIntegration(connection.id);
      await generateAIInsights(connection.client_id).catch(() => null);
      await loadConnections();
      setLogs(await getIntegrationLogs(connection.id));
      setMessage(`Sync completed. Imported ${result.rowsImported || 0} row(s).`);
    } catch (error) {
      setMessage(error.response?.data?.error || 'Sync failed.');
    } finally {
      setLoading('');
    }
  };

  const handleDisconnect = async (connection) => {
    try {
      setLoading(`disconnect-${connection.id}`);
      setMessage('');
      await disconnectIntegration(connection.id);
      await loadConnections();
      setLogs([]);
      setMessage('Integration disconnected.');
    } catch (error) {
      setMessage(error.response?.data?.error || 'Disconnect failed.');
    } finally {
      setLoading('');
    }
  };

  const formatDate = (value) => (value ? new Date(value).toLocaleString() : 'Not synced yet');

  return (
    <div>
      <div style={{ marginBottom: 22 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: '#0f172a', margin: 0 }}>
          Integrations
        </h1>
        <p style={{ color: '#64748b', marginTop: 6, fontSize: 13 }}>
          Connect client platforms and sync imported metrics into the same reporting engine used by manual uploads.
        </p>
      </div>

      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 18, marginBottom: 18 }}>
        <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#334155', marginBottom: 8 }}>
          Client
        </label>
        <select
          value={selectedClient}
          onChange={(event) => setSelectedClient(event.target.value)}
          style={{ width: '100%', maxWidth: 420, padding: '10px 12px', border: '1px solid #cbd5e1', borderRadius: 10 }}
        >
          <option value="">Select Client</option>
          {clients.map((client) => (
            <option key={client.id} value={client.id}>
              {client.name}
            </option>
          ))}
        </select>

        {message && (
          <div style={{ marginTop: 14, padding: 12, borderRadius: 10, background: '#eff6ff', color: '#1d4ed8', fontSize: 13, fontWeight: 600 }}>
            {message}
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
        {platforms.map((platform) => {
          const connection = connectionFor(platform.key);
          const busy = loading.includes(platform.key) || loading.includes(connection?.id);

          return (
            <div key={platform.key} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: 18 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: 16, color: '#0f172a' }}>{platform.name}</h3>
                  <p style={{ margin: '6px 0 0', fontSize: 12, color: '#64748b' }}>{platform.description}</p>
                </div>
                <span style={{
                  height: 24,
                  padding: '4px 9px',
                  borderRadius: 999,
                  fontSize: 11,
                  fontWeight: 800,
                  background: connection ? '#dcfce7' : platform.available ? '#dbeafe' : '#f1f5f9',
                  color: connection ? '#15803d' : platform.available ? '#1d4ed8' : '#64748b',
                }}>
                  {connection ? connection.status : platform.available ? 'Available' : 'Coming Soon'}
                </span>
              </div>

              {connection ? (
                <div style={{ marginTop: 16 }}>
                  <div style={{ background: '#f8fafc', borderRadius: 12, padding: 12, fontSize: 12, color: '#475569', lineHeight: 1.8 }}>
                    <div><strong>Account:</strong> {connection.account_name || connection.account_id}</div>
                    <div><strong>Frequency:</strong> {connection.sync_frequency}</div>
                    <div><strong>Last Sync:</strong> {formatDate(connection.last_sync_at)}</div>
                    {connection.last_error && <div style={{ color: '#dc2626' }}><strong>Error:</strong> {connection.last_error}</div>}
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                    <button
                      onClick={() => handleSync(connection)}
                      disabled={busy}
                      style={{ flex: 1, border: 0, borderRadius: 10, background: '#2563eb', color: '#fff', padding: '10px 12px', fontWeight: 800, cursor: 'pointer' }}
                    >
                      {busy ? 'Working...' : 'Sync Now'}
                    </button>
                    <button
                      onClick={() => handleDisconnect(connection)}
                      disabled={busy}
                      style={{ border: '1px solid #fecaca', borderRadius: 10, background: '#fff', color: '#dc2626', padding: '10px 12px', fontWeight: 800, cursor: 'pointer' }}
                    >
                      Disconnect
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => handleConnect(platform.key)}
                  disabled={!platform.available || busy}
                  style={{
                    width: '100%',
                    marginTop: 18,
                    border: 0,
                    borderRadius: 10,
                    background: platform.available ? '#0f172a' : '#e2e8f0',
                    color: platform.available ? '#fff' : '#64748b',
                    padding: '10px 12px',
                    fontWeight: 800,
                    cursor: platform.available ? 'pointer' : 'not-allowed',
                  }}
                >
                  {platform.available ? `Connect ${platform.name}` : 'Coming Soon'}
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: 18, marginTop: 18 }}>
        <h2 style={{ margin: 0, fontSize: 18, color: '#0f172a' }}>Sync Logs</h2>
        <div style={{ marginTop: 14 }}>
          {!activeConnectionId || logs.length === 0 ? (
            <div style={{ padding: 18, border: '1px dashed #cbd5e1', borderRadius: 12, color: '#64748b', fontSize: 13 }}>
              No sync logs yet.
            </div>
          ) : (
            logs.map((log) => (
              <div key={log.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '12px 0', borderBottom: '1px solid #f1f5f9', fontSize: 13 }}>
                <div>
                  <strong style={{ color: log.status === 'failed' ? '#dc2626' : '#0f172a' }}>{log.status}</strong>
                  <span style={{ color: '#64748b' }}> · fetched {log.rows_fetched || 0}, imported {log.rows_imported || 0}</span>
                  {log.error_message && <div style={{ color: '#dc2626', marginTop: 4 }}>{log.error_message}</div>}
                </div>
                <span style={{ color: '#94a3b8' }}>{formatDate(log.created_at)}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
