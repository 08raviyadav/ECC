# PR submission moderation

The PR Burst Guard protects review capacity using creation metadata. It runs on
new and reopened PRs targeting any branch, after this workflow merges. It does not
judge whether a patch is useful. Existing open PRs are not bulk-closed on rollout.

## Policy

| Control | Default | Enforcement |
| --- | --- | --- |
| Native concurrent cap | Five open PRs, including drafts | Admin must enable GitHub setting |
| Burst allowance | Five creations per author in 20 minutes | Close and lock excess PRs |
| Severe burst | More than ten creations in 20 minutes | Attempt account block; alert maintainers |
| Known denied account | User ID `108231307`, currently `dajiaohuang` | Close and lock its incoming/reopened PR |
| Trusted contributors | Live repository write, maintain, or admin permission | Exempt from the burst guard |
| Notifications | `@affaan-m @haelyra` | One bot-authored issue per author per UTC day, plus one escalation comment |

Edit `pr-burst-policy.json` to change thresholds, notification recipients or
denied numeric IDs. A native cap bypass list does not bypass the custom burst
guard. Granting write access is not required for native cap exceptions.

Closed and draft PRs count toward burst detection. Counting uses stable author
IDs and paginated REST creation metadata, without the search index. A run checks
historical windows from the triggering PR's creation time through newer API
rows. Queue delays, out-of-order delivery and replaced pending runs cannot hide
a burst already present in that snapshot. Excess PRs are determined in creation
order across all scanned windows, with PR number breaking timestamp ties.
Already closed excess PRs count
but are not mutated again.

Reopening an old ordinary PR does not add a new creation to the burst count.
Reopening a denied author's PR triggers denial even outside the time window.
The native concurrent cap supplies the pre-creation control. Actions moderation
happens after creation and cannot prevent every CI job from starting. Account
blocks cannot stop someone from using a different GitHub account.

## Activate

1. Merge the reviewed workflow and script into `main`.
2. As a repository administrator, enable the native cap under **Settings >
   Moderation options > Interaction limits > Pull request limits**. Set five
   concurrent PRs and include drafts. Alternatively, authenticate `gh` as an
   administrator and run:

   ```sh
   gh api --method PATCH repos/affaan-m/ECC/interaction-limits/pulls/creation-cap \
     -H 'X-GitHub-Api-Version: 2026-03-10' \
     -F enabled=true -F max_open_pull_requests=5 -F include_drafts=true
   gh api repos/affaan-m/ECC/interaction-limits/pulls/creation-cap
   ```

3. To enable automatic account blocking, `affaan-m` creates a dedicated
   fine-grained token with the account permission **Block another user: write**.
   Store it as repository Actions secret `PR_MODERATION_BLOCK_TOKEN`. Use GitHub's
   secret UI or `gh secret set PR_MODERATION_BLOCK_TOKEN --repo affaan-m/ECC`
   with its hidden prompt. Do not paste credentials into chat or source files.
4. Verify a genuine subsequent guard run and its job summary. Without the secret,
   closure and alerting still run. A severe burst records blocking as unavailable
   in the alert and fails the job so maintainers see the missing protection.

ECC currently belongs to the personal account `affaan-m`. GitHub account blocking
applies across **all repositories owned by that account**. The script checks the
token's authenticated identity before calling the personal blocking API. A
collaborator's personal block cannot protect this repository. The normal
`GITHUB_TOKEN` cannot perform account blocking. Organization blocking requires
a separate implementation if repository ownership changes.

GitHub's native cap counts concurrent open PRs. The custom guard counts creations
over time. Closing PRs can free native cap slots, but cannot reset burst counts.
A native cap can therefore stop a contributor before they reach the severe
threshold; the custom guard still catches rapid closing and resubmission.

## Verify without moderating anyone

```sh
node tests/ci/pr-burst-guard.test.js
node tests/ci/pr-burst-guard-workflow.test.js
node scripts/ci/validate-workflow-security.js
```

The workflow test executes the actual CLI against a disposable HTTP fixture.
It verifies close, lock, owner-identity blocking, secret separation, deduplicated
notifications, missing-secret failure and collaborator exemption.

For a live read-only replay, supply `GITHUB_TOKEN` through your secure shell
environment, then run:

```sh
GITHUB_REPOSITORY=affaan-m/ECC node scripts/ci/pr-burst-guard.js --dry-run --pr 3580
```

Expected for the October 14 snapshot: author `jwcastillo`, count `14`, `block:
true`, and nine excess PRs. Dry run never uses the blocking secret or writes to
GitHub. Hosted event delivery and real account blocking require post-merge
verification; the local fixture cannot certify those platform operations.

## Security and recovery

- The privileged event checks out its trusted default-branch SHA and two moderation files.
  It never checks out PR code, installs dependencies, or executes PR text.
- Credentials enter through environment variables. Owner identity verification
  and account blocking receive the owner credential. Repository moderation uses
  `GITHUB_TOKEN`.
- API failures cannot silently become an allowlist exemption. Only collaborator
  lookup `404` means an outsider; other errors fail the run.
- Close or lock failures appear in the alert and fail the job. Block failures
  preserve closure and alerting, then fail the job.
- Repeated runs update the bot-authored alert instead of creating new issues.
  A contributor-created lookalike cannot suppress alerts. Escalation remains
  recorded if a later run has a lower count.
- To roll back, disable **PR Burst Guard** in Actions. Remove its secret if
  abandoning automatic blocking. Disable the native cap separately in Settings.
- To restore a contributor, the owner removes the account block. Remove any
  denied user ID from the policy, then unlock and reopen selected PRs manually.

## October 15 investigation

Authenticated GitHub GraphQL returned zero `CLOSED_EVENT` or `REOPENED_EVENT`
entries across all 55 currently open `dajiaohuang` PRs. Their latest update was
October 8. The public timeline therefore supplies no evidence that they reopened
on October 15. Restored visibility after GitHub spam classification is a possible
explanation, but GitHub's private moderation history was unavailable. A block on
a collaborator's personal account would also have a different scope from an
owner block. The owner's actual block state was not available to this session.

The visible newer burst was 14 PRs from `jwcastillo`, #3567 through #3580, between
October 14 at 19:01:37 and 19:07:14 UTC. Volume alone does not establish the quality
of those patches. No historical PR was closed or account blocked during this
investigation. The native cap API returned `403: Must have admin rights to
Repository` for the authenticated collaborator `haelyra`.

This advances M0 maintenance reliability. Runtime sandbox, Capsule, Fleet,
release publication and shared application installation remain separate work.

## GitHub references

- [Native repository PR caps and bypass lists](https://docs.github.com/en/communities/moderating-comments-and-conversations/limiting-interactions-in-your-repository)
- [Repository cap REST endpoints](https://docs.github.com/en/rest/interactions/repos)
- [Personal account blocking REST endpoints](https://docs.github.com/en/rest/users/blocking)
- [Privileged pull request event security](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#pull_request_target)
