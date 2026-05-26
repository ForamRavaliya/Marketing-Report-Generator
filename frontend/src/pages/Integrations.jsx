import { useEffect, useMemo, useState } from 'react';
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
}