import { createFileRoute } from '@tanstack/react-router'
import { useUser } from '@clerk/clerk-react'

export const Route = createFileRoute('/demo/clerk')({
  component: App,
})

function App() {
  const { isSignedIn, user, isLoaded } = useUser()

  if (!isLoaded) {
    return <div className="p-4">Loading...</div>
  }

  if (!isSignedIn) {
    return <div className="p-4">Sign in to view this page</div>
  }

  return <div className="p-4">
    <div>Hello {user.firstName}!</div>
    {user.id}<br/>
    {user.username ?? ":("}<br/>
    {user.emailAddresses.map(email => (
      <div key={email.id}>
        {email.emailAddress} {email.verification.status === "verified" ? "(verified)" : "(unverified)"}
      </div>
    ))}
    {user.unverifiedExternalAccounts.map(account => (
      <div key={account.id}>
        {account.provider} - {account.providerUserId} ({account.emailAddress ?? "no email"})
      </div>
    ))}
    </div>
}
