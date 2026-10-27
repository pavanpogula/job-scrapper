/**
 * @file founderCredit.test.tsx
 * @summary Guards the "Founded by" credit in the footer and the founder card on the About page
 * @tags frontend, founder, footer, about, linkedin
 */
import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Footer } from '../components/Footer';
import { AboutPage } from '../pages/AboutPage';
import { FOUNDER } from '../lib/site';

const LINKEDIN = 'https://www.linkedin.com/in/pavan-reddy-pogula/';

/** Every founder link must open the real profile in a new tab without leaking the opener. */
function expectSafeLinkedInLink(link: HTMLElement) {
  expect(link).toHaveAttribute('href', LINKEDIN);
  expect(link).toHaveAttribute('target', '_blank');
  expect(link.getAttribute('rel')).toContain('noopener');
  expect(link.getAttribute('rel')).toContain('noreferrer');
}

describe('Founder credit', () => {
  it('keeps the founder details in one place', () => {
    expect(FOUNDER).toEqual({ name: 'Pavan Reddy Pogula', linkedinUrl: LINKEDIN, photoUrl: '/founder.jpg' });
  });

  it('footer shows "Founded by" with a LinkedIn link that says it opens LinkedIn in a new tab', () => {
    render(
      <MemoryRouter>
        <Footer />
      </MemoryRouter>
    );
    const footer = screen.getByRole('contentinfo');
    expect(within(footer).getByText(/Founded by/i)).toBeInTheDocument();
    const link = within(footer).getByRole('link', { name: /Pavan Reddy Pogula on LinkedIn \(opens in a new tab\)/i });
    expectSafeLinkedInLink(link);
  });

  it('About page has a Founder section with a LinkedIn preview card', () => {
    render(
      <MemoryRouter>
        <AboutPage />
      </MemoryRouter>
    );
    const section = screen.getByRole('region', { name: /founder/i });
    expect(within(section).getByText('Pavan Reddy Pogula')).toBeInTheDocument();
    expect(within(section).getByText('linkedin.com/in/pavan-reddy-pogula')).toBeInTheDocument();
    // Self-hosted copy of the LinkedIn profile photo (LinkedIn's own photo links expire)
    expect(within(section).getByRole('img', { name: 'Pavan Reddy Pogula' })).toHaveAttribute('src', '/founder.jpg');
    expectSafeLinkedInLink(within(section).getByRole('link', { name: /view .*linkedin/i }));
  });
});
