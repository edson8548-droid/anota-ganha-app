import js from '@eslint/js';
import globals from 'globals';
import react from 'eslint-plugin-react';

const campaignFiles = [
  'src/components/MasterCampaignModal.jsx',
  'src/components/MasterCampaignModal.test.jsx',
  'src/components/MasterCampaignsAdmin.jsx',
  'src/components/CodePromptModal.jsx',
  'src/components/CreateClientModal.jsx',
  'src/components/EditClientModal.jsx',
  'src/components/CampaignWeeklyResults.jsx',
  'src/components/CampaignOverviewDashboard.jsx',
  'src/components/TabelaPickerModal.jsx',
  'src/hooks/useMasterCampaigns.jsx',
  'src/services/campaigns.service.jsx',
  'src/utils/campaignIndustryMatch.js',
  'src/utils/campaignIndustryMatch.test.js',
  'src/utils/campaignProgress.js',
  'src/utils/campaignProgress.test.js',
  'src/utils/productSearch.js',
  'src/utils/productSearch.test.js',
  'src/utils/turbinado.jsx',
  'src/utils/turbinado.test.jsx',
];

export default [
  {
    files: campaignFiles,
    ...js.configs.recommended,
    plugins: {
      react,
    },
    languageOptions: {
      ...js.configs.recommended.languageOptions,
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
      globals: {
        ...globals.browser,
        ...globals.es2024,
      },
    },
    rules: {
      ...js.configs.recommended.rules,
      'react/jsx-uses-react': 'error',
      'react/jsx-uses-vars': 'error',
    },
  },
  {
    files: campaignFiles.filter(file => file.includes('.test.')),
    languageOptions: {
      globals: globals.vitest,
    },
  },
];
