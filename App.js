import React, { useEffect } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { AppProvider } from './src/context/AppContext';
import { AdminRoot } from './src/AdminRoot';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { ThemeTransitionOverlay } from './src/components/ThemeTransitionOverlay';

export default function App() {
  // Inject global CSS for admin thermal receipts, invisible scrollbars, and ergonomics
  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const styleId = 'global-admin-panel-style';
      if (!document.getElementById(styleId)) {
        const style = document.createElement('style');
        style.id = styleId;
        style.innerHTML = `
          /* Admin Web Optimization */
          html, body {
            overflow-x: hidden !important;
            margin: 0 !important;
            padding: 0 !important;
            -webkit-tap-highlight-color: transparent !important;
            -webkit-touch-callout: none !important;
            touch-action: manipulation !important;
            -webkit-text-size-adjust: 100% !important;
            font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "SF Pro", -apple-system-subheadline, "Helvetica Neue", Helvetica, Arial, sans-serif !important;
          }
          /* Invisible, seamless scrollbar for admin tables & thermal receipts */
          ::-webkit-scrollbar {
            width: 4px !important;
            height: 4px !important;
            background: transparent !important;
          }
          ::-webkit-scrollbar-track {
            background: transparent !important;
          }
          ::-webkit-scrollbar-thumb {
            background: rgba(148, 163, 184, 0.25) !important;
            border-radius: 4px !important;
          }
          * {
            scrollbar-width: thin !important;
          }
        `;
        document.head.appendChild(style);
      }

      // Smoothly dismiss splash screen once React takes over the DOM
      if (typeof window.__dismissSplash === 'function') {
        window.__dismissSplash();
      } else {
        const sp = document.getElementById('sr-splash');
        if (sp) {
          sp.style.opacity = '0';
          setTimeout(() => {
            if (sp && sp.parentNode) sp.parentNode.removeChild(sp);
          }, 320);
        }
      }
    }
  }, []);

  return (
    <ErrorBoundary>
      <AppProvider>
        <View style={styles.container}>
          <AdminRoot />
          <ThemeTransitionOverlay />
        </View>
      </AppProvider>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
    height: '100%',
    minHeight: Platform.OS === 'web' ? '100%' : '100%',
  },
});
