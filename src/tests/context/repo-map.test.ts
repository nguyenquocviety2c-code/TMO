/**
 * RepoMap Unit Tests
 *
 * Tests: buildRepoMap, renderRepoMap, cache hit/miss, token budget truncation.
 */
import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import * as path from 'path'
import * as fs from 'fs/promises'
import { buildRepoMap, renderRepoMap } from '@/lib/context/repo-map'
import type { FileSymbols } from '@/lib/context/types'

const TEST_DIR = path.join(process.cwd(), '.test-repo-map-tmp')

beforeAll(async () => {
  // Create a minimal test workspace
  await fs.mkdir(TEST_DIR, { recursive: true })
  await fs.writeFile(path.join(TEST_DIR, 'index.ts'), 'export function hello() { return "world" }\nexport const VERSION = "1.0"\n')
  await fs.writeFile(path.join(TEST_DIR, 'utils.ts'), 'export function add(a: number, b: number): number { return a + b }\n')
  await fs.writeFile(path.join(TEST_DIR, 'types.ts'), 'export interface User { name: string; age: number }\nexport type ID = string\n')
  await fs.writeFile(path.join(TEST_DIR, 'Component.tsx'), 'export const App = () => <div>Hello</div>\n')
  await fs.writeFile(path.join(TEST_DIR, 'README.md'), '# Test Project\n')
})

afterAll(async () => {
  await fs.rm(TEST_DIR, { recursive: true, force: true })
})

describe('buildRepoMap', () => {
  it('should extract symbols from TypeScript files', async () => {
    const map = await buildRepoMap(TEST_DIR, { maxFiles: 100 })
    expect(map.length).toBeGreaterThan(0)

    const indexFile = map.find(f => f.path === 'index.ts')
    expect(indexFile).toBeDefined()
    expect(indexFile!.symbols.length).toBeGreaterThanOrEqual(2)
    expect(indexFile!.symbols.some(s => s.name === 'hello' && s.kind === 'function')).toBe(true)
    expect(indexFile!.symbols.some(s => s.name === 'VERSION' && s.kind === 'const')).toBe(true)
  })

  it('should detect React components', async () => {
    const map = await buildRepoMap(TEST_DIR, { maxFiles: 100 })
    const compFile = map.find(f => f.path === 'Component.tsx')
    expect(compFile).toBeDefined()
    expect(compFile!.symbols.some(s => s.name === 'App' && s.kind === 'component')).toBe(true)
  })

  it('should extract interfaces and types', async () => {
    const map = await buildRepoMap(TEST_DIR, { maxFiles: 100 })
    const typesFile = map.find(f => f.path === 'types.ts')
    expect(typesFile).toBeDefined()
    expect(typesFile!.symbols.some(s => s.name === 'User' && s.kind === 'interface')).toBe(true)
    expect(typesFile!.symbols.some(s => s.name === 'ID' && s.kind === 'type')).toBe(true)
  })

  it('should list non-source files without symbols', async () => {
    const map = await buildRepoMap(TEST_DIR, { maxFiles: 100 })
    const readme = map.find(f => f.path === 'README.md')
    expect(readme).toBeDefined()
    expect(readme!.symbols.length).toBe(0)
  })

  it('should cache results (second call faster)', async () => {
    const start1 = Date.now()
    await buildRepoMap(TEST_DIR, { maxFiles: 100 })
    const dur1 = Date.now() - start1

    const start2 = Date.now()
    await buildRepoMap(TEST_DIR, { maxFiles: 100 })
    const dur2 = Date.now() - start2

    // Second call should be near-instant (cache hit)
    expect(dur2).toBeLessThanOrEqual(dur1)
  })
})

describe('renderRepoMap', () => {
  it('should render a tree view', async () => {
    const map = await buildRepoMap(TEST_DIR, { maxFiles: 100 })
    const rendered = renderRepoMap(map, 2000)
    expect(rendered).toContain('index.ts')
    expect(rendered).toContain('hello')
    expect(rendered).not.toContain('(empty workspace)')
  })

  it('should rank files by keyword match', async () => {
    const map = await buildRepoMap(TEST_DIR, { maxFiles: 100 })
    const rendered = renderRepoMap(map, 2000, 'User interface')
    // types.ts should appear early due to keyword match
    const typesIdx = rendered.indexOf('types.ts')
    const utilsIdx = rendered.indexOf('utils.ts')
    expect(typesIdx).toBeLessThan(utilsIdx)
  })

  it('should truncate when token budget exceeded', async () => {
    const map = await buildRepoMap(TEST_DIR, { maxFiles: 100 })
    const rendered = renderRepoMap(map, 1) // very small budget
    expect(rendered).toContain('truncated')
  })

  it('should return placeholder for empty map', () => {
    const rendered = renderRepoMap([], 2000)
    expect(rendered).toBe('(empty workspace)')
  })
})