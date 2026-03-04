import { createTheme, type PaletteMode } from '@mui/material/styles';

const PRIMARY_MAIN = '#eac54f';

export const THEME_STORAGE_KEY = 'starpage-theme';
export const DARK_THEME = 'starpage';
export const LIGHT_THEME = 'starpage-light';

function toMuiMode(value: string): PaletteMode {
  return value === LIGHT_THEME ? 'light' : 'dark';
}

export function toThemeName(mode: PaletteMode): string {
  return mode === 'light' ? LIGHT_THEME : DARK_THEME;
}

export function resolveStoredTheme(): string {
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (stored === DARK_THEME || stored === LIGHT_THEME) return stored;

  if (window.matchMedia?.('(prefers-color-scheme: light)').matches) {
    return LIGHT_THEME;
  }

  return DARK_THEME;
}

export function createStarPageTheme(themeName: string) {
  const mode = toMuiMode(themeName);

  const isLight = mode === 'light';

  return createTheme({
    palette: {
      mode,
      primary: {
        main: PRIMARY_MAIN,
        light: '#f2d980',
        dark: '#c7a63e',
        contrastText: isLight ? '#2a2110' : '#18120a'
      },
      secondary: {
        main: isLight ? '#826a1d' : '#bfa35a',
        contrastText: isLight ? '#fffaf0' : '#1f1708'
      },
      background: isLight
        ? {
            default: '#f7f4ea',
            paper: '#fffdf7'
          }
        : {
            default: '#15130f',
            paper: '#1f1b14'
          },
      text: isLight
        ? {
            primary: '#2e2a1f',
            secondary: '#5e5642'
          }
        : {
            primary: '#f5ecd2',
            secondary: '#cabb96'
          },
      info: {
        main: isLight ? '#2e8fcc' : '#7ac0f0'
      },
      success: {
        main: isLight ? '#2f9966' : '#74c991'
      },
      warning: {
        main: isLight ? '#b07a1f' : '#e4b55d'
      },
      error: {
        main: isLight ? '#c04444' : '#e27f7f'
      }
    },
    shape: {
      borderRadius: 12
    },
    typography: {
      fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          '*': {
            scrollbarWidth: 'none',
            msOverflowStyle: 'none'
          },
          '*::-webkit-scrollbar': {
            width: 0,
            height: 0
          },
          body: {
            margin: 0
          }
        }
      },
      MuiCard: {
        styleOverrides: {
          root: {
            borderRadius: 14
          }
        }
      },
      MuiButton: {
        defaultProps: {
          disableElevation: true
        }
      }
    }
  });
}
