import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

export type AppTheme = 'dark-high-contrast' | 'light-high-contrast'

type ThemeContextValue = {
  theme: AppTheme
  setTheme: (theme: AppTheme) => void
}

const THEME_STORAGE_KEY = 'system1-theme'
const DEFAULT_THEME: AppTheme = 'dark-high-contrast'

const ThemeContext = createContext<ThemeContextValue | null>(null)

const isAppTheme = (value: string | null): value is AppTheme =>
  value === 'dark-high-contrast' || value === 'light-high-contrast'

const loadStoredTheme = (): AppTheme => {
  if (typeof window === 'undefined') return DEFAULT_THEME
  const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY)
  return isAppTheme(storedTheme) ? storedTheme : DEFAULT_THEME
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<AppTheme>(loadStoredTheme)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    window.localStorage.setItem(THEME_STORAGE_KEY, theme)
  }, [theme])

  const value = useMemo(() => ({ theme, setTheme }), [theme])

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  return context
}
