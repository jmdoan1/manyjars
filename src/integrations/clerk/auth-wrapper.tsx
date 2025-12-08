import { useState } from 'react'
import { SignIn, SignUp, useUser } from '@clerk/clerk-react'

type AuthWrapperProps = {
  children: React.ReactNode
}

export function AuthWrapper({ children }: AuthWrapperProps) {
  const { isLoaded, isSignedIn } = useUser()
  const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn')

  if (!isLoaded) {
    // Global loading screen while Clerk is hydrating
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900 text-white">
        <div className="flex flex-col items-center gap-4">
          <div className="w-16 h-16 border-4 border-cyan-400/40 border-t-cyan-400 rounded-full animate-spin" />
          <div className="text-lg text-slate-200">Preparing your workspace…</div>
        </div>
      </div>
    )
  }

  if (!isSignedIn) {
    const isSignIn = mode === 'signIn'

    return (
      <div className="min-h-screen flex items-center justify-center bg-linear-to-b from-slate-900 via-slate-800 to-slate-900">
        <div className="flex flex-col items-center gap-6">
          <div className="text-center space-y-2">
            <h1 className="text-3xl font-bold text-white">
              manyjar
            </h1>
            <p className="text-slate-300">
              Sign {isSignIn ? 'in' : 'up'} to manage your Jars.
            </p>
          </div>

          <div className="bg-slate-900/70 border border-slate-700 rounded-xl p-6 shadow-xl">
            {isSignIn ? (
              <SignIn
                appearance={{
                  elements: {
                    footerAction: { display: 'none' },
                  },
                }}
              />
            ) : (
              <SignUp
                appearance={{
                  elements: {
                    footerAction: { display: 'none' },
                  },
                }}
              />
            )}
          </div>

          <button
            type="button"
            onClick={() => setMode(isSignIn ? 'signUp' : 'signIn')}
            className="text-sm text-slate-300 hover:text-white underline underline-offset-4"
          >
            {isSignIn
              ? "Don't have an account? Sign up"
              : 'Already have an account? Sign in'}
          </button>
        </div>
      </div>
    )
  }

  // Authenticated: render the actual app
  return <>{children}</>
}