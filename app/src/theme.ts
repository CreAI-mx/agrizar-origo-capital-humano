import { theme as antdTheme, type ThemeConfig } from 'antd';

// Values come from design/tokens.css (Agrizar design system): dark is the primary identity,
// light exists for daylight and projection. Components read these through Ant Design tokens.
const shared: ThemeConfig['token'] = {
  borderRadius: 12,
  fontFamily: '-apple-system, system-ui, "SF Pro Text", "Segoe UI", Roboto, sans-serif',
  fontFamilyCode: '"SF Mono", ui-monospace, "Cascadia Mono", "Roboto Mono", Menlo, monospace',
};

export const agrizarDark: ThemeConfig = {
  algorithm: antdTheme.darkAlgorithm,
  token: {
    ...shared,
    colorPrimary: '#93D500',
    colorInfo: '#93D500',
    colorSuccess: '#93D500',
    colorWarning: '#F7B32B',
    colorError: '#FF7A82',
    colorBgBase: '#0A0D0B',
    colorBgLayout: '#0A0D0B',
    colorBgContainer: '#161B14',
    colorBgElevated: '#1D2419',
    colorBorder: 'rgba(255, 255, 255, 0.17)',
    colorBorderSecondary: 'rgba(255, 255, 255, 0.10)',
    colorTextLightSolid: '#0A0D0B',
  },
};

export const agrizarLight: ThemeConfig = {
  algorithm: antdTheme.defaultAlgorithm,
  token: {
    ...shared,
    colorPrimary: '#006E43',
    colorInfo: '#006E43',
    colorSuccess: '#2F7D3F',
    colorWarning: '#8A6519',
    colorError: '#9C4632',
    colorBgBase: '#FBF8F1',
    colorBgLayout: '#EDE7DA',
    colorBgContainer: '#FBF8F1',
    colorBgElevated: '#FFFFFF',
    colorBorder: 'rgba(38, 43, 28, 0.24)',
    colorBorderSecondary: 'rgba(38, 43, 28, 0.13)',
  },
};
