import { useCallback, useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  KeyRound,
  LogIn,
  Settings2,
  Loader2,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { invoke, listen } from '@/lib/transport'
import { openExternal } from '@/lib/platform'
import { usePreferences, useSavePreferences } from '@/services/preferences'
import {
  useClickUpAuth,
  useClickUpWorkspaces,
  clickupQueryKeys,
} from '@/services/clickup'

/**
 * Inline setup component shown when ClickUp is selected but not configured.
 *
 * Three states:
 * 1. No credentials -> input fields for client_id/secret
 * 2. Not authenticated -> "Sign in" button
 * 3. No workspace/space -> dropdowns to select them
 */
export function ClickUpSetup() {
  const queryClient = useQueryClient()
  const { data: preferences } = usePreferences()
  const [justAuthenticated, setJustAuthenticated] = useState(false)

  const hasCredentials =
    !!preferences?.clickup_client_id && !!preferences?.clickup_client_secret

  const auth = useClickUpAuth({ enabled: hasCredentials })
  const isAuthenticated = auth.data?.authenticated === true

  const workspaces = useClickUpWorkspaces({
    enabled: isAuthenticated,
  })

  // Listen for OAuth completion
  useEffect(() => {
    const unlistenPromise = listen('clickup:auth-complete', () => {
      setJustAuthenticated(true)
      queryClient.invalidateQueries({ queryKey: clickupQueryKeys.auth() })
      queryClient.invalidateQueries({
        queryKey: clickupQueryKeys.workspaces(),
      })
      setTimeout(() => setJustAuthenticated(false), 3000)
    })
    return () => {
      unlistenPromise.then(fn => fn())
    }
  }, [queryClient])

  if (!preferences) return null

  // State 1: No credentials
  if (!hasCredentials) {
    return <CredentialsForm />
  }

  // State 2: Not authenticated
  if (!isAuthenticated) {
    return <AuthPrompt isLoading={auth.isLoading} />
  }

  // State 3: No workspace selected (spaces are browsed via tree)
  if (!preferences.clickup_workspace_id) {
    return (
      <ScopeSelector
        workspaces={workspaces.data ?? []}
        isLoadingWorkspaces={workspaces.isLoading}
        workspacesError={workspaces.error}
        selectedWorkspaceId={preferences.clickup_workspace_id}
        justAuthenticated={justAuthenticated}
        onRetry={() => {
          queryClient.invalidateQueries({
            queryKey: clickupQueryKeys.workspaces(),
          })
        }}
      />
    )
  }

  return null
}

function CredentialsForm() {
  const { data: preferences } = usePreferences()
  const savePreferences = useSavePreferences()
  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')

  const handleSave = useCallback(() => {
    if (!preferences || !clientId.trim() || !clientSecret.trim()) return
    savePreferences.mutate({
      ...preferences,
      clickup_client_id: clientId.trim(),
      clickup_client_secret: clientSecret.trim(),
    })
  }, [preferences, clientId, clientSecret, savePreferences])

  return (
    <div className="flex flex-col items-center justify-center py-8 px-4 text-center gap-3">
      <KeyRound className="h-5 w-5 text-muted-foreground" />
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">
          ClickUp OAuth credentials required
        </p>
        <p className="text-xs text-muted-foreground">
          Create an app at{' '}
          <button
            type="button"
            className="text-primary hover:underline inline-flex items-center gap-0.5"
            onClick={() =>
              openExternal('https://app.clickup.com/settings/apps')
            }
          >
            ClickUp Settings
            <ExternalLink className="h-3 w-3" />
          </button>{' '}
          and enter your credentials below.
        </p>
      </div>
      <div className="flex flex-col gap-2 w-full max-w-[280px]">
        <Input
          placeholder="Client ID"
          value={clientId}
          onChange={e => setClientId(e.target.value)}
          className="text-xs h-8"
        />
        <Input
          placeholder="Client Secret"
          type="password"
          value={clientSecret}
          onChange={e => setClientSecret(e.target.value)}
          className="text-xs h-8"
        />
        <Button
          variant="outline"
          size="sm"
          onClick={handleSave}
          disabled={
            !clientId.trim() ||
            !clientSecret.trim() ||
            savePreferences.isPending
          }
        >
          {savePreferences.isPending ? (
            <Loader2 className="h-3 w-3 animate-spin mr-1" />
          ) : null}
          Save Credentials
        </Button>
      </div>
    </div>
  )
}

function AuthPrompt({ isLoading }: { isLoading: boolean }) {
  const { data: preferences } = usePreferences()
  const [isSigningIn, setIsSigningIn] = useState(false)

  const handleSignIn = useCallback(async () => {
    if (!preferences?.clickup_client_id || !preferences?.clickup_client_secret)
      return
    setIsSigningIn(true)
    try {
      await invoke('clickup_start_oauth', {
        clientId: preferences.clickup_client_id,
        clientSecret: preferences.clickup_client_secret,
      })
    } catch {
      setIsSigningIn(false)
    }
  }, [preferences])

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-8 px-4 text-center gap-3">
        <Loader2 className="h-5 w-5 text-muted-foreground animate-spin" />
        <p className="text-sm text-muted-foreground">
          Checking ClickUp authentication...
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center justify-center py-8 px-4 text-center gap-3">
      <LogIn className="h-5 w-5 text-muted-foreground" />
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">
          Sign in to ClickUp
        </p>
        <p className="text-xs text-muted-foreground">
          Authenticate to access your ClickUp tasks
        </p>
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={handleSignIn}
        disabled={isSigningIn}
      >
        {isSigningIn ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
        Sign in to ClickUp
      </Button>
    </div>
  )
}

function ScopeSelector({
  workspaces,
  isLoadingWorkspaces,
  workspacesError,
  selectedWorkspaceId,
  justAuthenticated,
  onRetry,
}: {
  workspaces: { id: string; name: string }[]
  isLoadingWorkspaces: boolean
  workspacesError: Error | null
  selectedWorkspaceId: string | null
  justAuthenticated: boolean
  onRetry: () => void
}) {
  const { data: preferences } = usePreferences()
  const savePreferences = useSavePreferences()
  const [workspaceId, setWorkspaceId] = useState(selectedWorkspaceId ?? '')

  const handleSave = useCallback(() => {
    if (!preferences || !workspaceId) return
    savePreferences.mutate({
      ...preferences,
      clickup_workspace_id: workspaceId,
    })
  }, [preferences, workspaceId, savePreferences])

  return (
    <div className="flex flex-col items-center justify-center py-8 px-4 text-center gap-3">
      {justAuthenticated ? (
        <CheckCircle2 className="h-5 w-5 text-green-500" />
      ) : (
        <Settings2 className="h-5 w-5 text-muted-foreground" />
      )}
      <div className="space-y-1">
        {justAuthenticated && (
          <p className="text-xs font-medium text-green-500">
            Connected to ClickUp!
          </p>
        )}
        <p className="text-sm font-medium text-foreground">Select workspace</p>
        <p className="text-xs text-muted-foreground">
          Choose your ClickUp workspace to browse tasks
        </p>
      </div>

      {workspacesError ? (
        <div className="flex flex-col items-center gap-1.5 w-full max-w-[280px]">
          <div className="flex items-center gap-1.5 text-destructive">
            <AlertCircle className="h-3.5 w-3.5" />
            <p className="text-xs">Failed to load workspaces</p>
          </div>
          <p className="text-xs text-muted-foreground break-all">
            {String(workspacesError.message || workspacesError)}
          </p>
          <Button variant="outline" size="sm" onClick={onRetry}>
            Retry
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-2 w-full max-w-[280px]">
          <Select value={workspaceId} onValueChange={setWorkspaceId}>
            <SelectTrigger size="sm" className="w-full text-xs">
              <SelectValue
                placeholder={
                  isLoadingWorkspaces
                    ? 'Loading workspaces...'
                    : workspaces.length === 0
                      ? 'No workspaces found'
                      : 'Select workspace'
                }
              />
            </SelectTrigger>
            <SelectContent>
              {workspaces.map(ws => (
                <SelectItem key={ws.id} value={ws.id}>
                  {ws.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            variant="outline"
            size="sm"
            onClick={handleSave}
            disabled={!workspaceId || savePreferences.isPending}
          >
            {savePreferences.isPending ? (
              <Loader2 className="h-3 w-3 animate-spin mr-1" />
            ) : null}
            Continue
          </Button>
        </div>
      )}
    </div>
  )
}
