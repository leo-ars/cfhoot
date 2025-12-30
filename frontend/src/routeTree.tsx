import { createRootRoute, createRoute, Outlet } from '@tanstack/react-router';
import { Home } from './pages/Home';
import { HostCreate } from './pages/HostCreate';
import { HostPresenter } from './pages/HostPresenter';
import { PlayerJoin } from './pages/PlayerJoin';
import { PlayerGame } from './pages/PlayerGame';

const rootRoute = createRootRoute({
  component: () => (
    <div className="min-h-screen">
      <Outlet />
    </div>
  ),
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: Home,
});

const hostCreateRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/host/create',
  component: HostCreate,
});

const hostPresenterRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/host/presenter/$gameId',
  component: HostPresenter,
});

const playerJoinRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/play',
  component: PlayerJoin,
});

const playerGameRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/play/$gameId',
  component: PlayerGame,
});

export const routeTree = rootRoute.addChildren([
  indexRoute,
  hostCreateRoute,
  hostPresenterRoute,
  playerJoinRoute,
  playerGameRoute,
]);
