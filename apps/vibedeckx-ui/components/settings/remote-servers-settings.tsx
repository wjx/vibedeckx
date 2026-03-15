'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { api, type RemoteServer } from '@/lib/api';
import {
  Globe,
  Plus,
  Pencil,
  Trash2,
  PlugZap,
  Check,
  X,
  Loader2,
} from 'lucide-react';

type TestStatus = 'idle' | 'testing' | 'success' | 'error';

interface ServerFormState {
  name: string;
  url: string;
  apiKey: string;
}

const emptyForm: ServerFormState = { name: '', url: '', apiKey: '' };

export function RemoteServersSettings() {
  const [servers, setServers] = useState<RemoteServer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Add/Edit dialog
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingServer, setEditingServer] = useState<RemoteServer | null>(null);
  const [form, setForm] = useState<ServerFormState>(emptyForm);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<RemoteServer | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Test connection status per server
  const [testStatuses, setTestStatuses] = useState<Record<string, TestStatus>>({});
  const [testErrors, setTestErrors] = useState<Record<string, string>>({});

  const loadServers = useCallback(async () => {
    try {
      const data = await api.getRemoteServers();
      setServers(data);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load servers');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadServers();
  }, [loadServers]);

  // --- Add / Edit ---

  const openAddDialog = () => {
    setEditingServer(null);
    setForm(emptyForm);
    setFormError('');
    setIsFormOpen(true);
  };

  const openEditDialog = (server: RemoteServer) => {
    setEditingServer(server);
    setForm({ name: server.name, url: server.url, apiKey: '' });
    setFormError('');
    setIsFormOpen(true);
  };

  const handleFormSubmit = async () => {
    if (!form.name.trim()) {
      setFormError('Name is required');
      return;
    }
    if (!form.url.trim()) {
      setFormError('URL is required');
      return;
    }

    setSaving(true);
    setFormError('');
    try {
      if (editingServer) {
        const opts: { name?: string; url?: string; apiKey?: string } = {};
        if (form.name.trim() !== editingServer.name) opts.name = form.name.trim();
        if (form.url.trim() !== editingServer.url) opts.url = form.url.trim();
        if (form.apiKey.trim()) opts.apiKey = form.apiKey.trim();
        await api.updateRemoteServer(editingServer.id, opts);
      } else {
        await api.createRemoteServer({
          name: form.name.trim(),
          url: form.url.trim(),
          ...(form.apiKey.trim() ? { apiKey: form.apiKey.trim() } : {}),
        });
      }
      setIsFormOpen(false);
      await loadServers();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Failed to save server');
    } finally {
      setSaving(false);
    }
  };

  // --- Delete ---

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.deleteRemoteServer(deleteTarget.id);
      setDeleteTarget(null);
      await loadServers();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Failed to delete server');
    } finally {
      setDeleting(false);
    }
  };

  // --- Test Connection ---

  const handleTestConnection = async (server: RemoteServer) => {
    setTestStatuses((prev) => ({ ...prev, [server.id]: 'testing' }));
    setTestErrors((prev) => {
      const next = { ...prev };
      delete next[server.id];
      return next;
    });
    try {
      const result = await api.testRemoteServer(server.id);
      setTestStatuses((prev) => ({
        ...prev,
        [server.id]: result.success ? 'success' : 'error',
      }));
      if (!result.success) {
        setTestErrors((prev) => ({ ...prev, [server.id]: 'Connection failed' }));
      }
    } catch (e) {
      setTestStatuses((prev) => ({ ...prev, [server.id]: 'error' }));
      setTestErrors((prev) => ({
        ...prev,
        [server.id]: e instanceof Error ? e.message : 'Test failed',
      }));
    }
  };

  const renderTestButton = (server: RemoteServer) => {
    const status = testStatuses[server.id] || 'idle';
    return (
      <Button
        variant="ghost"
        size="icon"
        onClick={() => handleTestConnection(server)}
        disabled={status === 'testing'}
        title="Test connection"
        className="h-8 w-8"
      >
        {status === 'testing' ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : status === 'success' ? (
          <Check className="h-4 w-4 text-green-500" />
        ) : status === 'error' ? (
          <X className="h-4 w-4 text-red-500" />
        ) : (
          <PlugZap className="h-4 w-4" />
        )}
      </Button>
    );
  };

  // --- Render ---

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium">Remote Servers</h3>
          <p className="text-xs text-muted-foreground">
            Manage globally available remote servers
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={openAddDialog}>
          <Plus className="h-4 w-4 mr-1.5" />
          Add Server
        </Button>
      </div>

      {error && (
        <p className="text-sm text-red-500">{error}</p>
      )}

      {servers.length === 0 ? (
        <div className="text-center py-8 text-sm text-muted-foreground border rounded-md">
          <Globe className="h-8 w-8 mx-auto mb-2 opacity-40" />
          No remote servers configured
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>URL</TableHead>
              <TableHead className="w-[140px] text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {servers.map((server) => (
              <TableRow key={server.id}>
                <TableCell className="font-medium">{server.name}</TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {server.url}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    {renderTestButton(server)}
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => openEditDialog(server)}
                      title="Edit server"
                      className="h-8 w-8"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setDeleteTarget(server)}
                      title="Delete server"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  {testErrors[server.id] && (
                    <p className="text-xs text-red-500 mt-1 text-right">
                      {testErrors[server.id]}
                    </p>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {/* Add/Edit Server Dialog */}
      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingServer ? 'Edit Server' : 'Add Remote Server'}
            </DialogTitle>
            <DialogDescription>
              {editingServer
                ? 'Update the server connection details.'
                : 'Add a new remote server to the global registry.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Name</label>
              <Input
                value={form.name}
                onChange={(e) => {
                  setForm((f) => ({ ...f, name: e.target.value }));
                  setFormError('');
                }}
                placeholder="My Remote Server"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">URL</label>
              <Input
                value={form.url}
                onChange={(e) => {
                  setForm((f) => ({ ...f, url: e.target.value }));
                  setFormError('');
                }}
                placeholder="http://remote-server:5173"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">API Key</label>
              <Input
                type="password"
                value={form.apiKey}
                onChange={(e) => {
                  setForm((f) => ({ ...f, apiKey: e.target.value }));
                  setFormError('');
                }}
                placeholder={editingServer ? '(unchanged)' : 'Optional'}
              />
            </div>

            {formError && (
              <p className="text-sm text-red-500">{formError}</p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsFormOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleFormSubmit} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              {editingServer ? 'Save Changes' : 'Add Server'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Server</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete{' '}
              <span className="font-semibold">{deleteTarget?.name}</span>? This
              will also remove it from any projects that reference it.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
