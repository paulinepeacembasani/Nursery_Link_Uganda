import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { http, server } from '../../test/msw';
import { renderRoute } from '../../test/render';
import { embeddableSurvey } from './api';
import WelcomeNotice from './WelcomeNotice';

const health = (site: { demo_notice: boolean; survey_url: string | null }) => { server.use(
    http.get('/health', ({ response }) =>
      response(200).json({
        data: {
          status: 'ok', db: 'ok', version: 'test', commit: null,
          providers: { payment: 'mock', sms: 'mock', routing: 'mock', email: 'mock' },
          payment_methods: { mtn_momo: true, airtel_money: true },
          features: { phone_verification: true, payments: true },
          site,
        },
      })
    )
  ); };

afterEach(() => { localStorage.clear(); });

describe('WelcomeNotice', () => {
  it('says the data is sample data, offers the survey, and is shown only once', async () => {
    health({ demo_notice: true, survey_url: 'https://docs.google.com/forms/d/e/abc/viewform' });
    const { unmount } = renderRoute(<WelcomeNotice />);
    expect(await screen.findByRole('dialog', { name: 'Welcome to Nursery Link Uganda' })).toBeInTheDocument();
    expect(screen.getByText(/sample data for demonstration/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Take the survey' })).toHaveAttribute('href', '/survey');

    await userEvent.click(screen.getByRole('button', { name: 'Continue to the site' }));
    await waitFor(() => { expect(screen.queryByRole('dialog')).not.toBeInTheDocument(); });
    unmount();

    renderRoute(<WelcomeNotice />);
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows nothing when the notice is off and there is no survey', async () => {
    health({ demo_notice: false, survey_url: null });
    renderRoute(<WelcomeNotice />);
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('is not shown on the nursery order map opened from an SMS', async () => {
    health({ demo_notice: true, survey_url: null });
    renderRoute(<WelcomeNotice />, { path: '/o/:code', at: '/o/ABC234' });
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('embeddableSurvey', () => {
  it('embeds Google Forms and links to anything else', () => {
    expect(embeddableSurvey('https://docs.google.com/forms/d/e/abc/viewform?usp=sf_link')).toBe('https://docs.google.com/forms/d/e/abc/viewform?usp=sf_link&embedded=true');
    expect(embeddableSurvey('https://forms.gle/xyz')).toBeNull();
    expect(embeddableSurvey('not a url')).toBeNull();
  });
});
