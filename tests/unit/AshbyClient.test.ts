/**
 * @file AshbyClient Unit Tests
 * @summary Unit test suite for Ashby API client with browser headers, retry/backoff, GraphQL fallback, and salary extraction
 * @tags Unit Test, Ashby API, GraphQL, Fallback, Retry, Compensation
 */

import axios from 'axios';
import {
    extractSalary,
    fetchAshbyBoardWithFallback,
    fetchFromAshbyGraphQL,
    isRetryableError
} from '../../src/lib/AshbyClient';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('AshbyClient Unit Tests', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('extractSalary', () => {
        it('should extract salary from Ashby summaryComponents', () => {
            const job: any = {
                id: '1',
                title: 'Engineer',
                compensation: {
                    summaryComponents: [
                        {
                            compensationType: 'Salary',
                            interval: '1 YEAR',
                            currencyCode: 'USD',
                            minValue: 180000,
                            maxValue: 240000
                        },
                        {
                            compensationType: 'EquityCashValue',
                            interval: '1 YEAR',
                            currencyCode: 'USD',
                            minValue: null,
                            maxValue: null
                        }
                    ]
                }
            };

            expect(extractSalary(job)).toEqual({
                min: 180000,
                max: 240000,
                currency: 'USD',
                interval: '1 YEAR'
            });
        });

        it('should fall back to compensationTiers components when summaryComponents is missing', () => {
            const job: any = {
                id: '2',
                title: 'Designer',
                compensation: {
                    compensationTiers: [
                        {
                            components: [
                                {
                                    compensationType: 'Salary',
                                    currencyCode: 'GBP',
                                    minValue: 90000,
                                    maxValue: 120000
                                }
                            ]
                        }
                    ]
                }
            };

            expect(extractSalary(job)).toEqual({
                min: 90000,
                max: 120000,
                currency: 'GBP'
            });
        });

        it('should support legacy compensationTier shape', () => {
            const job: any = {
                id: '3',
                title: 'PM',
                compensationTier: {
                    min: 150000,
                    max: 200000,
                    currency: 'USD',
                    interval: 'YEAR'
                }
            };

            expect(extractSalary(job)).toEqual({
                min: 150000,
                max: 200000,
                currency: 'USD',
                interval: 'YEAR'
            });
        });

        it('should return empty object when no compensation is present', () => {
            const job: any = { id: '4', title: 'Intern' };
            expect(extractSalary(job)).toEqual({});
        });
    });

    describe('isRetryableError', () => {
        it('should return true for 429 and 5xx HTTP status codes and timeout codes', () => {
            expect(isRetryableError({ response: { status: 429 } })).toBe(true);
            expect(isRetryableError({ response: { status: 503 } })).toBe(true);
            expect(isRetryableError({ code: 'ECONNABORTED' })).toBe(true);
            expect(isRetryableError({ code: 'ETIMEDOUT' })).toBe(true);
        });

        it('should return false for 404 or generic errors', () => {
            expect(isRetryableError({ response: { status: 404 } })).toBe(false);
            expect(isRetryableError(new Error('Generic error'))).toBe(false);
        });
    });

    describe('fetchFromAshbyGraphQL', () => {
        it('should map GraphQL jobPostings and teams into AshbyJob objects', async () => {
            mockedAxios.post.mockResolvedValueOnce({
                data: {
                    data: {
                        jobBoard: {
                            teams: [{ id: 'team-1', name: 'Sales', parentTeamId: null }],
                            jobPostings: [
                                {
                                    id: 'post-1',
                                    title: 'Account Executive',
                                    teamId: 'team-1',
                                    locationName: 'Remote - US',
                                    workplaceType: 'Remote',
                                    employmentType: 'FullTime',
                                    compensationTierSummary: '$150K - $200K'
                                }
                            ]
                        }
                    }
                }
            });

            const res = await fetchFromAshbyGraphQL('go-augment');
            expect(res.boardExists).toBe(true);
            expect(res.jobs).toHaveLength(1);
            expect(res.jobs[0]).toMatchObject({
                id: 'post-1',
                title: 'Account Executive',
                department: 'Sales',
                location: 'Remote - US',
                isRemote: true,
                applyUrl: 'https://jobs.ashbyhq.com/go-augment/post-1/application'
            });
        });
    });

    describe('fetchAshbyBoardWithFallback', () => {
        it('should recover jobs via GraphQL when Posting API returns 404 (e.g. go-augment)', async () => {
            mockedAxios.get.mockRejectedValueOnce({
                isAxiosError: true,
                response: { status: 404 }
            });
            mockedAxios.isAxiosError.mockReturnValueOnce(true);

            mockedAxios.post.mockResolvedValueOnce({
                data: {
                    data: {
                        jobBoard: {
                            teams: [{ id: 't1', name: 'Engineering' }],
                            jobPostings: [
                                {
                                    id: 'job-99',
                                    title: 'Backend Engineer',
                                    teamId: 't1',
                                    locationName: 'San Francisco',
                                    workplaceType: 'Hybrid',
                                    employmentType: 'FullTime'
                                }
                            ]
                        }
                    }
                }
            });

            const result = await fetchAshbyBoardWithFallback('go-augment', {
                includeCompensation: true
            });

            expect(result.source).toBe('graphql');
            expect(result.notFound).toBe(false);
            expect(result.jobs).toHaveLength(1);
            expect(result.jobs[0].title).toBe('Backend Engineer');
            expect(result.jobs[0].department).toBe('Engineering');
        });

        it('should retry on HTTP 429 and succeed on subsequent attempt', async () => {
            mockedAxios.get
                .mockRejectedValueOnce({
                    isAxiosError: true,
                    response: { status: 429 }
                })
                .mockResolvedValueOnce({
                    data: {
                        jobs: [
                            {
                                id: 'j1',
                                title: 'SRE',
                                department: 'Infra',
                                location: 'Remote',
                                employmentType: 'FullTime',
                                applyUrl: 'https://jobs.ashbyhq.com/acme/j1/application',
                                isRemote: true,
                                jobUrl: 'https://jobs.ashbyhq.com/acme/j1'
                            }
                        ]
                    }
                });

            const result = await fetchAshbyBoardWithFallback('acme', {
                baseDelayMs: 1
            });

            expect(mockedAxios.get).toHaveBeenCalledTimes(2);
            expect(result.source).toBe('rest');
            expect(result.jobs).toHaveLength(1);
        });

        it('should send BROWSER_HEADERS on GET and POST requests', async () => {
            mockedAxios.get.mockResolvedValueOnce({
                data: { jobs: [] }
            });

            await fetchAshbyBoardWithFallback('test-slug');

            expect(mockedAxios.get).toHaveBeenCalledWith(
                expect.stringContaining('test-slug'),
                expect.objectContaining({
                    headers: expect.objectContaining({
                        'User-Agent': expect.stringContaining('Mozilla/5.0'),
                        'Accept-Language': 'en-US,en;q=0.9'
                    })
                })
            );

            mockedAxios.post.mockResolvedValueOnce({
                data: { data: { jobBoard: { teams: [], jobPostings: [] } } }
            });

            await fetchFromAshbyGraphQL('test-slug');

            expect(mockedAxios.post).toHaveBeenCalledWith(
                expect.any(String),
                expect.any(Object),
                expect.objectContaining({
                    headers: expect.objectContaining({
                        'User-Agent': expect.stringContaining('Mozilla/5.0'),
                        'Content-Type': 'application/json'
                    })
                })
            );
        });

        it('should fall back to GraphQL on 403 and 400 without setting rateLimited', async () => {
            mockedAxios.isAxiosError.mockReturnValue(true);

            // 403 test
            mockedAxios.get.mockRejectedValueOnce({
                isAxiosError: true,
                response: { status: 403 }
            });
            mockedAxios.post.mockResolvedValueOnce({
                data: {
                    data: {
                        jobBoard: {
                            teams: [],
                            jobPostings: [{ id: 'gql-1', title: 'Engineer' }]
                        }
                    }
                }
            });

            const res403 = await fetchAshbyBoardWithFallback('forbidden-slug');
            expect(res403.source).toBe('graphql');
            expect(res403.rateLimited).toBe(false);
            expect(res403.jobs).toHaveLength(1);

            // 400 test
            mockedAxios.get.mockRejectedValueOnce({
                isAxiosError: true,
                response: { status: 400 }
            });
            mockedAxios.post.mockResolvedValueOnce({
                data: {
                    data: {
                        jobBoard: {
                            teams: [],
                            jobPostings: [{ id: 'gql-2', title: 'Designer' }]
                        }
                    }
                }
            });

            const res400 = await fetchAshbyBoardWithFallback('badreq-slug');
            expect(res400.source).toBe('graphql');
            expect(res400.rateLimited).toBe(false);
            expect(res400.jobs).toHaveLength(1);
        });

        it('should return failure info http/503/3 when 503 retries are exhausted', async () => {
            mockedAxios.isAxiosError.mockReturnValue(true);
            mockedAxios.get
                .mockRejectedValueOnce({ isAxiosError: true, response: { status: 503 } })
                .mockRejectedValueOnce({ isAxiosError: true, response: { status: 503 } })
                .mockRejectedValueOnce({ isAxiosError: true, response: { status: 503 } });

            const result = await fetchAshbyBoardWithFallback('exhausted-503', {
                maxRetries: 2,
                baseDelayMs: 1
            });

            expect(result.source).toBe('none');
            expect(result.failure).toEqual({
                kind: 'http',
                status: 503,
                code: 'http/503/3',
                attempts: 3
            });
        });

        it('should return failure info timeout when request times out', async () => {
            mockedAxios.isAxiosError.mockReturnValue(true);
            mockedAxios.get
                .mockRejectedValueOnce({ code: 'ETIMEDOUT', message: 'Connection timed out' })
                .mockRejectedValueOnce({ code: 'ETIMEDOUT', message: 'Connection timed out' });

            const result = await fetchAshbyBoardWithFallback('timeout-slug', {
                maxRetries: 1,
                baseDelayMs: 1
            });

            expect(result.source).toBe('none');
            expect(result.failure).toEqual({
                kind: 'timeout',
                status: undefined,
                code: 'timeout',
                attempts: 2
            });
        });

        it('should honor Retry-After header and cap at 10 seconds', async () => {
            jest.useFakeTimers();
            mockedAxios.isAxiosError.mockReturnValue(true);

            // Mock 429 with Retry-After: 30 (should be capped at 10s)
            mockedAxios.get
                .mockRejectedValueOnce({
                    isAxiosError: true,
                    response: {
                        status: 429,
                        headers: { 'retry-after': '30' }
                    }
                })
                .mockResolvedValueOnce({
                    data: { jobs: [{ id: 'after-429', title: 'Staff Eng' }] }
                });

            const promise = fetchAshbyBoardWithFallback('capped-retry-after', {
                maxRetries: 1,
                baseDelayMs: 1
            });

            // Fast-forward 9999ms - should still be pending
            await jest.advanceTimersByTimeAsync(9999);
            expect(mockedAxios.get).toHaveBeenCalledTimes(1);

            // Advance past 10000ms
            await jest.advanceTimersByTimeAsync(200);
            const result = await promise;

            expect(mockedAxios.get).toHaveBeenCalledTimes(2);
            expect(result.source).toBe('rest');
            expect(result.rateLimited).toBe(true);

            jest.useRealTimers();
        });
    });
});
