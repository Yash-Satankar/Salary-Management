'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ApiError, fieldErrorsOf } from '@/lib/api-client';
import { useTerminateEmployee } from '../hooks';

const today = () => new Date().toISOString().slice(0, 10);

export function TerminateDialog({ id, name }: { id: number; name: string }) {
  const [open, setOpen] = useState(false);
  const [terminatedOn, setTerminatedOn] = useState(today);
  const [error, setError] = useState<string>();
  const terminate = useTerminateEmployee(id);

  const confirm = () => {
    setError(undefined);
    terminate.mutate(
      { terminatedOn },
      {
        onSuccess: () => {
          toast.success(`${name} terminated as of ${terminatedOn}`);
          setOpen(false);
        },
        onError: (failure) =>
          setError(
            fieldErrorsOf(failure).terminatedOn?.[0] ??
              (failure instanceof ApiError
                ? failure.message
                : 'Termination failed. Please try again.'),
          ),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="destructive">Terminate</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Terminate {name}?</DialogTitle>
          <DialogDescription>
            The record and salary history are kept, but the employee becomes read-only and is
            excluded from insights. This cannot be undone in the app.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="terminatedOn">Termination date</Label>
          <Input
            id="terminatedOn"
            type="date"
            value={terminatedOn}
            max={today()}
            aria-invalid={error ? true : undefined}
            onChange={(event) => setTerminatedOn(event.target.value)}
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">Cancel</Button>
          </DialogClose>
          <Button
            variant="destructive"
            onClick={confirm}
            disabled={terminate.isPending || !terminatedOn}
          >
            Terminate employee
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
