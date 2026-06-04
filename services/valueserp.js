const MAX_LOCAL_POSITIONS = 20;
const RETRY_DELAY_MS = 2000;
const MAX_RETRIES = 3;
const BETWEEN_KEYWORDS_DELAY_MS = 5000;
const BETWEEN_PAGES_DELAY_MS = 3000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isOurBusiness(resultTitle, businessName) {
  if (!resultTitle) return false;
  return resultTitle.toLowerCase().includes(businessName.toLowerCase());
}

function extractLocalResults(data) {
  let localResults = [];
  if (data.places_results) localResults = localResults.concat(data.places_results);
  if (data.local_results) localResults = localResults.concat(data.local_results);
  return localResults;
}

async function checkSingleKeyword(keyword, businessName, location) {
  const apiKey = process.env.API_KEY;
  if (!apiKey) throw new Error('API_KEY environment variable is missing');

  let retryDelay = RETRY_DELAY_MS;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    let foundPosition = -1;
    let foundBusinessData = null;
    let totalChecked = 0;
    let currentPage = 1;
    let apiError = null;

    try {
      while (totalChecked < MAX_LOCAL_POSITIONS && foundPosition === -1) {
        const url = new URL('https://api.valueserp.com/search');
        url.searchParams.set('api_key', apiKey);
        url.searchParams.set('q', keyword);
        url.searchParams.set('location', location);
        url.searchParams.set('search_type', 'places');
        url.searchParams.set('hl', 'en');
        url.searchParams.set('gl', 'us');
        url.searchParams.set('page', String(currentPage));
        url.searchParams.set('num', '20');

        console.log(`[ValueSERP] "${keyword}" page ${currentPage} (attempt ${attempt})`);
        const response = await fetch(url.toString());

        if (response.status === 429) {
          console.warn(`[ValueSERP] Rate limited, retrying in ${retryDelay / 1000}s`);
          await sleep(retryDelay);
          retryDelay *= 2;
          break; // break inner while to trigger outer retry
        }

        let data;
        const rawText = await response.text();
        try {
          data = JSON.parse(rawText);
        } catch {
          throw new Error(`ValueSERP returned non-JSON (HTTP ${response.status}): ${rawText.substring(0, 200)}`);
        }

        if (!response.ok) {
          const msg = data?.request_info?.message || data?.error || `HTTP ${response.status}`;
          throw new Error(`ValueSERP error: ${msg}`);
        }

        if (data.request_info && data.request_info.success === false) {
          throw new Error(`ValueSERP rejected request: ${data.request_info.message}`);
        }

        const pageResults = extractLocalResults(data);
        console.log(`[ValueSERP] "${keyword}" page ${currentPage}: ${pageResults.length} results`);
        if (pageResults.length === 0) break;

        for (const result of pageResults) {
          totalChecked++;
          if (isOurBusiness(result.title, businessName)) {
            foundPosition = totalChecked;
            foundBusinessData = {
              businessTitle: result.title,
              address: result.address || 'N/A',
              phone: result.phone || 'N/A',
              rating: result.rating?.toString() || 'N/A',
              reviews: result.reviews?.toString() || 'N/A',
            };
            break;
          }
          if (totalChecked >= MAX_LOCAL_POSITIONS) break;
        }

        currentPage++;
        if (foundPosition === -1 && totalChecked < MAX_LOCAL_POSITIONS) {
          await sleep(BETWEEN_PAGES_DELAY_MS);
        }
      }

      // If we broke out due to rate limit, retry the outer loop
      if (foundPosition === -1 && apiError) {
        if (attempt < MAX_RETRIES) { await sleep(retryDelay); retryDelay *= 2; continue; }
      }

      return {
        keyword,
        position: foundPosition > 0 ? foundPosition : null,
        businessTitle: foundBusinessData?.businessTitle || null,
        address: foundBusinessData?.address || null,
        phone: foundBusinessData?.phone || null,
        rating: foundBusinessData?.rating || null,
        reviews: foundBusinessData?.reviews || null,
      };
    } catch (err) {
      console.error(`[ValueSERP] Attempt ${attempt} failed for "${keyword}":`, err.message);
      if (attempt === MAX_RETRIES) {
        return {
          keyword,
          position: null,
          businessTitle: null,
          address: null,
          phone: null,
          rating: null,
          reviews: null,
          error: err.message,
        };
      }
      await sleep(retryDelay);
      retryDelay *= 2;
    }
  }
}

export async function checkRankings(keywords, businessName, location) {
  const results = [];

  for (let i = 0; i < keywords.length; i++) {
    const keyword = keywords[i].toLowerCase();
    console.log(`[ValueSERP] Checking keyword ${i + 1}/${keywords.length}: "${keyword}"`);

    const result = await checkSingleKeyword(keyword, businessName, location);
    results.push(result);

    if (i < keywords.length - 1) {
      await sleep(BETWEEN_KEYWORDS_DELAY_MS);
    }
  }

  return results;
}
