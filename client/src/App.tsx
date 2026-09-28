import { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { useSettings } from './store/settings';
import { useServerEvents } from './lib/socket';

/** Loads settings once and keeps them live across every page. */
export function App() {
  const { load, apply, loaded } = useSettings();

  useEffect(() => {
    load();
  }, [load]);

  useServerEvents((e) => {
    if (e.type === 'settings:updated') apply(e.settings);
  });

  return loaded ? <Outlet /> : null;
}
