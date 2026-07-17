export type GitHubRepositoryLink = { owner: string; repo: string };

export function parseGitHubRepositoryLink(url: URL): GitHubRepositoryLink | null {
  if (!/(^|\.)github\.com$/i.test(url.hostname)) return null;
  const [owner, repo] = url.pathname.split('/').filter(Boolean);
  if (!owner || !repo || owner.length > 100 || repo.length > 100) return null;
  if (!/^[\w.-]+$/.test(owner) || !/^[\w.-]+$/.test(repo)) return null;
  return { owner, repo: repo.replace(/\.git$/i, '') };
}
