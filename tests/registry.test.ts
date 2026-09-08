import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchPackages, RegistryUnavailableError } from '../src/registry';

const okResponse = (body: unknown): Response =>
  ({ ok: true, status: 200, json: async () => body }) as Response;

const statusResponse = (status: number): Response =>
  ({ ok: status >= 200 && status < 300, status, json: async () => ({}) }) as Response;

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchPackages', () => {
  it('maps abbreviated packuments into the internal shape', async () => {
    fetchMock.mockResolvedValue(
      okResponse({
        name: 'primeng',
        'dist-tags': { latest: '17.18.0' },
        versions: { '17.18.0': { peerDependencies: { '@angular/core': '^17.0.0' } } },
      }),
    );

    const { packages, notFound } = await fetchPackages(['primeng']);

    expect(notFound).toEqual([]);
    expect(packages['primeng']).toEqual({
      name: 'primeng',
      distTags: { latest: '17.18.0' },
      versions: [{ version: '17.18.0', peerDependencies: { '@angular/core': '^17.0.0' } }],
    });
  });

  it('records a 404 as notFound, not as an error', async () => {
    fetchMock.mockResolvedValue(statusResponse(404));

    const { packages, notFound } = await fetchPackages(['ghost-package']);

    expect(packages).toEqual({});
    expect(notFound).toEqual(['ghost-package']);
  });

  it('sorts notFound and de-duplicates the request queue', async () => {
    fetchMock.mockResolvedValue(statusResponse(404));

    const { notFound } = await fetchPackages(['zebra', 'apple', 'zebra']);

    expect(notFound).toEqual(['apple', 'zebra']);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('throws RegistryUnavailableError on a non-404 error status', async () => {
    fetchMock.mockResolvedValue(statusResponse(503));
    await expect(fetchPackages(['primeng'])).rejects.toThrow(RegistryUnavailableError);
    await expect(fetchPackages(['primeng'])).rejects.toThrow('HTTP 503');
  });

  it('throws RegistryUnavailableError when the connection fails', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));
    await expect(fetchPackages(['primeng'])).rejects.toThrow('could not reach the npm registry');
  });

  it('reports a timeout during the initial response distinctly', async () => {
    fetchMock.mockRejectedValue(new DOMException('The operation timed out', 'TimeoutError'));
    await expect(fetchPackages(['primeng'])).rejects.toThrow('did not respond within 15s');
  });

  const bodyRejects = (cause: unknown): void => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => {
        throw cause;
      },
    } as unknown as Response);
  };

  it('reports a timeout while reading the body as a timeout, not a malformed response', async () => {
    // fetch() resolves once headers arrive; a stall mid-body aborts response.json().
    bodyRejects(new DOMException('The operation was aborted', 'TimeoutError'));
    await expect(fetchPackages(['primeng'])).rejects.toThrow('did not respond within 15s');
  });

  it('reports a dropped connection while reading the body as unreachable', async () => {
    bodyRejects(new TypeError('terminated'));
    await expect(fetchPackages(['primeng'])).rejects.toThrow('could not reach the npm registry');
  });

  it('throws RegistryUnavailableError only on a genuine JSON parse error', async () => {
    bodyRejects(new SyntaxError('Unexpected end of JSON input'));
    await expect(fetchPackages(['primeng'])).rejects.toThrow('malformed response');
  });
});
