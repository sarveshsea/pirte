import { lazy, Suspense } from 'react'
import { Routes, Route, useLocation } from 'react-router-dom'
import Splash from './components/Splash'
import SideNav from './components/SideNav'
import RouteError from './components/RouteError'
import { DotsSpinner } from './components/spinners'
import { appRoutes } from './lib/routes'

const NotFound     = lazy(() => import('./routes/NotFound'))

function RouteLoader() {
  return (
    <div className="grid place-items-center gap-3 py-24 text-[13px] tracking-[0.18em] text-[var(--color-dim)]">
      <DotsSpinner size={20} color="var(--color-fg)" />
      <span>loading…</span>
    </div>
  )
}

function AnimatedRoutes() {
  const location = useLocation()
  return (
    <div key={location.pathname} className="route-animate min-w-0">
      <RouteError resetKey={location.pathname}>
        <Suspense fallback={<RouteLoader />}>
          <Routes location={location}>
            {appRoutes.map((route) => (
              <Route
                key={route.path}
                path={route.path}
                element={<route.Component />}
              />
            ))}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </RouteError>
    </div>
  )
}

export default function App() {
  const location = useLocation()
  const isHome = location.pathname === '/'

  return (
    <>
      <SideNav />
      <main className="min-h-screen min-w-0 overflow-x-clip lg:pl-[var(--layout-nav-width)]">
        <div className={isHome
          ? 'min-h-screen min-w-0 pt-[112px] lg:pt-0'
          : 'min-w-0 px-4 pb-10 pt-[118px] sm:px-6 sm:pt-[126px] md:px-8 lg:px-8 lg:pt-6'}
        >
          <AnimatedRoutes />
        </div>
      </main>
      <Splash />
    </>
  )
}
