# First Day Intern Project: Add Request ID Tracking

## 🎯 Project Overview

Add request ID tracking across the APIBlaze services. This will help with debugging by giving each request a unique identifier that flows through the system. This is a simple, focused project that touches all three codebases.

## 📋 Learning Objectives

By the end of this project, you will:
- Understand how requests flow through the APIBlaze system
- Work with HTTP headers in Cloudflare Workers (Hono)
- Work with Next.js API routes
- Learn about request tracing and debugging

## 🏗️ Architecture Context

- **dashboard-apiblazev3**: Next.js dashboard (makes API calls)
- **admin-api worker**: Cloudflare Worker handling admin operations
- **main-proxy worker**: Cloudflare Worker that proxies API requests

**Request Flow**: Dashboard → Admin API → (sometimes) Main Proxy

## ✅ Task: Add Request ID Header

Add a unique request ID to every request that:
1. Gets generated if not present (incoming request)
2. Gets passed along to downstream services
3. Gets returned in the response headers
4. Gets logged in console logs

### Step 1: Add Request ID Middleware to Admin API (20 min)

**File**: `v2APIblaze/workers/admin-api/src/index.ts`

Add middleware that:
- Checks for `X-Request-ID` header (or generates one if missing)
- Adds it to response headers
- Includes it in console logs

**Code Pattern**:
```typescript
// Generate a simple request ID (you can use crypto.randomUUID() or Date.now() + random)
function generateRequestId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

// Add middleware before routes
app.use('*', async (c, next) => {
  const requestId = c.req.header('X-Request-ID') || generateRequestId();
  
  // Add to context for use in handlers
  c.set('requestId', requestId);
  
  // Log with request ID
  console.log(`[${requestId}] ${c.req.method} ${c.req.path}`);
  
  await next();
  
  // Add to response headers
  c.header('X-Request-ID', requestId);
});
```

### Step 2: Add Request ID Middleware to Main Proxy (15 min)

**File**: `v2APIblaze/workers/main-proxy/src/index.ts`

Add the same middleware pattern to the main-proxy worker.

### Step 3: Add Request ID to Dashboard API Calls (15 min)

**File**: `dashboard-apiblazev3/lib/api.ts`

Modify the `request` method to:
- Generate a request ID for outgoing requests
- Add it as `X-Request-ID` header
- Log it (optional, for debugging)

**Code Pattern**:
```typescript
private async request<T>(...): Promise<T> {
  const requestId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    'X-Request-ID': requestId,  // Add this
    ...options.headers,
  };
  
  // Optional: log the request ID
  console.log(`[API Request ${requestId}] ${endpoint}`);
  
  // ... rest of the method
}
```

### Step 4: Test It! (10 min)

1. Make a request from the dashboard (e.g., list projects)
2. Check the browser DevTools Network tab - you should see `X-Request-ID` in response headers
3. Check the worker logs - you should see the request ID in console logs
4. Verify the ID is the same across the request chain

## 🧪 Testing

1. **Test in browser**:
   - Open DevTools → Network tab
   - Make a request (e.g., load projects)
   - Check response headers for `X-Request-ID`

2. **Test in worker logs**:
   - Check Cloudflare Workers logs (or `wrangler dev` console)
   - Verify request IDs appear in logs

3. **Test request flow**:
   - Make a request that goes: Dashboard → Admin API
   - Verify the same request ID flows through

## 📚 Resources

- **Hono Middleware**: https://hono.dev/getting-started/cloudflare-workers#middleware
- **HTTP Headers**: https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers
- **crypto.randomUUID()**: Available in Cloudflare Workers

## 💡 Tips

1. Use `crypto.randomUUID()` if available, or a simple timestamp + random string
2. The request ID should be unique per request
3. Check existing middleware patterns in the codebase
4. Keep it simple - this is just about adding a header and logging it

## 🎉 Success Criteria

The project is complete when:
- ✅ Every request has an `X-Request-ID` header
- ✅ Request IDs appear in worker console logs
- ✅ Request IDs appear in response headers (visible in browser DevTools)
- ✅ Request IDs flow through the system (same ID from dashboard → admin-api)

## 🚀 Bonus (if you finish early)

- Add request ID to error responses
- Add request ID to analytics/logging pipeline
- Create a simple debug page that shows recent request IDs

---

**Estimated Time**: 1 hour
**Difficulty**: Beginner
**Impact**: Medium - Improves debugging and observability

Good luck! 🚀

