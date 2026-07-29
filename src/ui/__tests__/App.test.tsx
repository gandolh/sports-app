// @vitest-environment jsdom
//
// Exists to prove the per-file jsdom opt-in works. The default test environment
// is `node`, so src/domain/ tests never pay for a DOM they don't use.
import { render, screen } from '@testing-library/react'
import { App } from '../App.tsx'

it('renders the app shell', () => {
  render(<App />)
  expect(screen.getByRole('heading', { name: 'Calisthenics' })).toBeTruthy()
})
