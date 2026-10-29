/**
 * @file brandMark.test.tsx
 * @summary Guards the B.O.O.L.E.A.N logo: header mark, About page logo, favicon and link-preview tags
 * @tags frontend, brand, logo, favicon
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { BrandMark } from '../components/brand/BrandMark';
import { AboutPage } from '../pages/AboutPage';
import { BRAND } from '../lib/site';

const root = resolve(__dirname, '../..');
const publicFile = (url: string) => resolve(root, 'public', url.replace(/^\//, ''));

describe('Brand logo', () => {
  it('every logo URL points at a file in public/', () => {
    for (const url of [BRAND.markUrl, BRAND.logoUrl, '/brand/apple-touch-icon.png', '/brand/boolean-logo-512.jpg']) {
      expect(existsSync(publicFile(url)), url).toBe(true);
    }
  });

  it('BrandMark shows the logo mark as a decorative image next to the wordmark', () => {
    const { container } = render(<BrandMark size="medium" />);
    const img = container.querySelector('img');
    expect(img).toHaveAttribute('src', BRAND.markUrl);
    expect(img).toHaveAttribute('alt', '');
    expect(img).toHaveAttribute('width', '28');
    expect(screen.getByText('B.O.O.L.E.A.N')).toBeInTheDocument();
  });

  it('About page shows the full logo with a text description', () => {
    render(
      <MemoryRouter>
        <AboutPage />
      </MemoryRouter>
    );
    expect(screen.getByRole('img', { name: /B\.O\.O\.L\.E\.A\.N logo/ })).toHaveAttribute('src', BRAND.logoUrl);
  });

  it('index.html uses the mark as favicon and the PNG logo for link previews', () => {
    const html = readFileSync(resolve(root, 'index.html'), 'utf8');
    expect(html).toContain(`<link rel="icon" type="image/svg+xml" href="${BRAND.markUrl}" />`);
    expect(html).toContain('<link rel="apple-touch-icon" href="/brand/apple-touch-icon.png" />');
    expect(html).toContain('<meta property="og:image" content="https://www.boolean.page/brand/boolean-logo-512.jpg" />');
  });
});
