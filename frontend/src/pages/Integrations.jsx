import { useEffect, useState } from 'react';
import {
  getIntegrations,
  demoConnectIntegration,
  syncIntegration,
  getIntegrationLogs,
  getClients,
} from '../utils/api';

const platforms = [
  {
    key: 'meta',
    name: 'Meta Ads',
    icon: '📘',
    color: '#1877F2',
  },
  {
    key: 'google',
    name: 'Google Ads',
    icon: '🟢',
    color: '#34A853',
  },
  {
    key: 'analytics',
    name: 'Google Analytics',
    icon: '📊',
    color: '#F9AB00',
  },
];

export default function Integrations() {
  const [integrations, setIntegrations] = useState([]);
  const [logs, setLogs] = useState([]);
  const [clients, setClients] = useState([]);
  const [selectedClient, setSelectedClient] = useState('');
  const [loading, setLoading] = useState(false);

  const loadData = async () => {
    try {
      const [iRes, lRes, cRes] = await Promise.all([
        getIntegrations(),
        getIntegrationLogs(),
        getClients(),
      ]);

      setIntegrations(iRes || []);
      setLogs(lRes || []);
      setClients(cRes || []);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleConnect = async (platform) => {
    if (!selectedClient) {
      alert('Please select a client first');
      return;
    }

    try {
      setLoading(true);

      await demoConnectIntegration({
        clientId: selectedClient,
        platform,
      });

      await loadData();

      alert(`${platform.toUpperCase()} connected successfully`);
    } catch (err) {
      console.error(err);
      alert('Connection failed');
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async (id) => {
    try {
      setLoading(true);

      await syncIntegration(id);

      await loadData();

      alert('Sync completed successfully');
    } catch (err) {
      console.error(err);
      alert('Sync failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 bg-[#F8FAFC] min-h-screen">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-800">
          Integrations
        </h1>

        <p className="text-slate-500 mt-2">
          Connect advertising platforms and sync campaign data
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-5 mb-8 shadow-sm">
        <label className="block text-sm font-medium text-slate-700 mb-2">
          Select Client
        </label>

        <select
          value={selectedClient}
          onChange={(e) => setSelectedClient(e.target.value)}
          className="w-full max-w-md border border-slate-300 rounded-xl px-4 py-3 outline-none"
        >
          <option value="">Choose Client</option>

          {clients.map((client) => (
            <option key={client.id} value={client.id}>
              {client.name}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
        {platforms.map((platform) => {
          const connected = integrations.find(
            (i) => i.platform === platform.key
          );

          return (
            <div
              key={platform.key}
              className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm"
            >
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-3">
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl"
                    style={{
                      background: `${platform.color}15`,
                    }}
                  >
                    {platform.icon}
                  </div>

                  <div>
                    <h2 className="font-bold text-slate-800">
                      {platform.name}
                    </h2>

                    <p className="text-xs text-slate-500">
                      Ads & analytics integration
                    </p>
                  </div>
                </div>

                <div
                  className={`px-3 py-1 rounded-full text-xs font-semibold ${
                    connected
                      ? 'bg-green-100 text-green-700'
                      : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  {connected ? 'Connected' : 'Not Connected'}
                </div>
              </div>

              {connected ? (
                <>
                  <div className="space-y-2 mb-5 text-sm">
                    <div className="flex justify-between">
                      <span className="text-slate-500">
                        Account
                      </span>

                      <span className="font-medium text-slate-700">
                        {connected.account_name}
                      </span>
                    </div>

                    <div className="flex justify-between">
                      <span className="text-slate-500">
                        Last Sync
                      </span>

                      <span className="font-medium text-slate-700">
                        {new Date(
                          connected.last_synced_at
                        ).toLocaleString()}
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={() => handleSync(connected.id)}
                    disabled={loading}
                    className="w-full bg-slate-900 hover:bg-slate-800 text-white py-3 rounded-xl font-medium transition"
                  >
                    {loading ? 'Syncing...' : 'Sync Now'}
                  </button>
                </>
              ) : (
                <button
                  onClick={() => handleConnect(platform.key)}
                  disabled={loading}
                  className="w-full text-white py-3 rounded-xl font-medium transition"
                  style={{
                    background: platform.color,
                  }}
                >
                  {loading
                    ? 'Connecting...'
                    : `Connect ${platform.name}`}
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-slate-800">
            Recent Sync Activity
          </h2>

          <div className="text-xs bg-green-100 text-green-700 px-3 py-1 rounded-full font-semibold">
            Live Logs
          </div>
        </div>

        <div className="space-y-4">
          {logs.length === 0 ? (
            <div className="text-slate-500 text-sm">
              No sync activity yet
            </div>
          ) : (
            logs.map((log) => (
              <div
                key={log.id}
                className="border border-slate-200 rounded-xl p-4 flex items-start justify-between"
              >
                <div>
                  <div className="font-semibold text-slate-800">
                    {log.message}
                  </div>

                  <div className="text-sm text-slate-500 mt-1">
                    Platform: {log.platform?.toUpperCase()}
                  </div>

                  <div className="text-sm text-slate-500">
                    Campaigns Synced:{' '}
                    {log.synced_campaigns || 0}
                  </div>
                </div>

                <div className="text-xs text-slate-400">
                  {new Date(log.created_at).toLocaleString()}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}