# Simple Rate Limiting API

The goal of this little R&D was to come up with a way for web services to leverage rate limiting as an external service.
The implementation is inspired by the many researches done to find a good starting point for more production-like implementation.

* Rolling window (with redis[[1]](#ref1)) has been chosen (knowing drawbacks, especially size of lists for dayly/monthy limits for example)
* Redis (lists[[1]](#ref1) and model[[2]](#ref2)) has been chosen to help with the distributed need, and scalability.
* Kong (Rate Limiting Plugin[[3]](#ref3), Enterprise version[[4]](#ref4)) provided a LUA implementation of this, in an API Gateway setting (so different from here)

# Usage


1. Create application in Okta with `client_credentials` grant type at least and add `customScope` scope. Keep the domain (something like *https://dev-abcd.okta.com*), client id and secret handy to use those to get a token later on.

2. Create `.env` file based on `.env.sample`. Fill in Okta client id and domain.

3. Start app with:

```bash	
npm start
```

4. Start redis

```bash
redis-server
```

5. Get token from Okta:

```bash
curl -X POST -H "Authorization: Basic $(echo -n "_your_clientid:_your_clientsecret" | base64)" https://_your_okta_domain/oauth2/default/v2/token --data "grant_type=client_credentials&scope=customScope"
```

6. Copy the `access_token` from it and export it:

```bash
export TOKEN="...access token here..."
```

7. Setup your client rate limit policy:

```bash
curl -X POST -H "Authorization: Bearer $TOKEN" http://localhost:3000/clients --data "config.minute=10" --data "config.hour=100"
```
	
You should get a JSON response echoing the configuration you just specified, something like this:

```json
[
  {
    "clientId": "_your_client_id",
    "period": "minute",
    "value": "10"
  },
  {
    "clientId": "_your_client_id",
    "period": "hour",
    "value": "100"
  }
]
```

8. Check rate limit against a resource key:

```bash
curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/clients/_your_client_id/resources/some_arbitrary_key
```

You should get a JSON response with periods and their status (pass or exceeded). Something of the sort:

```json
{
  "periods": [
    {
      "period": "minute",
      "details": {
        "status": "exceeded limit",
        "limit": 10,
        "remaining": 0,
        "retryAfter": 39106
      }
    },
    {
      "period": "hour",
      "details": {
        "status": "pass",
        "limit": 100,
        "remaining": 88,
        "retryAfter": 0
      }
    }
  ],
  "retryAfter": 39106
}
```

From a client standpoint, one should consider getting the `retryAfter` value and pause/sleep/wait for its amount of time in millis (or reject a request for the key used here).
In case of rate-limiting, HTTP status code of `429` (Too Many Requests) will be returned. HTTP headers are also provided in the response (rate-limited or not):

```
X-RateLimit-Limit-minute: 10
X-RateLimit-Remaining-minute: 0
X-RateLimit-Remaining-minute-Reset: 51624
X-RateLimit-Limit-day: 100
X-RateLimit-Remaining-day: 77
```

The `-Reset` headers are only provided when rate limited.

# Estimated Costs of Implementation

# AWS ElasticBeanstalk 


* EC2: m5.large (): $71.424/month
* Classic Load Balancer: $18.6/month + $0.104 ($0.008*13GB=$0.104) = $18.704/month
* ...


# AWS Lambda

Assuming:

* An average 100 new connections per second for Load Balancer
* Client sends an average of 5 requests per second per connection (over 94M requests per month)
* Each request lasts around 100ms
* 2,000 bytes per request (JWT token is quite big) (about 12.5GB/month)
* 10 rules on the load balancer
* 128MB memory for Lambda
* Using DynamoDB to store rate-limit policies. Policies are written only once or so, so writes are not considered. We use a cache (5 minutes) to avoid too many reads, leading to about 9K reads, which is again marginal.

Estimated costs is **<$75/month**

Details:

* DynamoDB: **<$1/month**
    * Writes: $0
    * Reads: $0
    * Storage: $0 (Free tier)
* Application Load Balancer: **$40.548/month**
    * Load balancer: $0.0225/hour = $16.74/month (0.0225 x 24 x 31)
    * LCU:
        * New connections (per second): 4 LCUs (100 connections per second / 25 connections per second)
        * Active connections (per minute): 0.03 LCUs (100 active connections per minute / 3,000 active connections per minute)
        * Processed bytes (GBs per hour): 0.034 LCUs (0.3352 GB/1 GB).
        * Rule evaluations (per second): 0 LCU
        * Total = $0.032/hour (4 LCU x $0.008/hour) = $23.808/month ($0.032 x 24 x 31)
* Lambda: **$31.872/month**
  * Monthly compute charges = $13.1
    * Compute (seconds): 94,860,000 requests per month lasting 100ms = 9,486,000 seconds
    * Compute (GB-s): 9,486,000 seconds x 128MB/1024 = 1,185,750 GB-s
    * Total Compute = 1,185,750 GB-s – 400,000 free tier GB-s = 785,750 GB-s
    * Total = 785,750 GB-s x $0.00001667 = $13.1
  * Monthly requests charges = $18.772
    * 94,860,000 requests – 1M free tier requests = 93,860,000 Monthly billable requests
    * Total = 93.860 x $0.2 = $18.772

# References

<a id="ref1">[1]</a> Rate Limiting using Redis Lists and Sorted Sets, Sahil Jadon, https://medium.com/@sahiljadon/rate-limiting-using-redis-lists-and-sorted-sets-9b42bc192222

<a id="ref2">[2]</a> System Design — Rate limiter and Data modelling, Sai Sandeep Mopuri, https://medium.com/@saisandeepmopuri/system-design-rate-limiter-and-data-modelling-9304b0d18250

<a id="ref3">[3]</a> Rate Limiting, Kong, https://docs.konghq.com/hub/kong-inc/rate-limiting/#enabling-the-plugin-on-a-service

<a id="ref4">[4]</a> Rate Limiting (Enterprise), Kong, https://docs.konghq.com/enterprise/references/rate-limiting/
