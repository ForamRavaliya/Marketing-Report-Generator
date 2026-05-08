const axios = require('axios');

const META_API_VERSION = 'v20.0';

const fetchMetaInsights = async ({ adAccountId, accessToken }) => {
  if (!adAccountId || !accessToken) {
    throw new Error('Meta adAccountId and accessToken are required');
  }

  const cleanAdAccountId = adAccountId.startsWith('act_')
    ? adAccountId
    : `act_${adAccountId}`;

  const url = `https://graph.facebook.com/${META_API_VERSION}/${cleanAdAccountId}/insights`;

  const response = await axios.get(url, {
    params: {
      access_token: accessToken,
      level: 'campaign',
      date_preset: 'last_30d',
      fields: [
        'campaign_name',
        'spend',
        'reach',
        'impressions',
        'clicks',
        'actions',
      ].join(','),
    },
  });

  return response.data?.data || [];
};

const normalizeMetaInsights = (rows = []) => {
  return rows.map((row) => {
    const leadAction = row.actions?.find(
      (a) =>
        a.action_type === 'lead' ||
        a.action_type === 'onsite_conversion.lead_grouped' ||
        a.action_type === 'offsite_conversion.fb_pixel_lead'
    );

    return {
      campaignName: row.campaign_name || 'Meta Campaign',
      spend: Number(row.spend || 0),
      reach: Number(row.reach || 0),
      impressions: Number(row.impressions || 0),
      clicks: Number(row.clicks || 0),
      conversions: Number(leadAction?.value || 0),
      revenue: 0,
    };
  });
};

module.exports = {
  fetchMetaInsights,
  normalizeMetaInsights,
};