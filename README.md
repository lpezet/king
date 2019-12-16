# Simple Rate Limiting API

The goal of this little project was to come up with a way for web services to leverage rate limiting as an external service.
The implementation is inspired by the many researches done to find a good starting point for more production-like implementation.

* Rolling window ([with redis][1]) has been chosen (knowing drawbacks, especially size of lists for dayly/monthy limits for example)
* Redis ([lists][1] and [model][2]) has been chosen to help with the distributed need, and scalability.
* Kong ([Rate Limiting Plugin][3], [Enterprise version][4]) provided a LUA implementation of this, in an API Gateway setting (so different from here)

# Usage


1. Create application in Okta with `client_credentials` grant type at least and add `customScope` scope. Keep the domain (something like *https://dev-abcd.okta.com*), client id and secret handy to use those to get a token later on.

2. Create `.env` file based on `.env.sample`. Fill in Okta client id and domain.

3. Start app with:
	
	npm start

4. Get token from Okta:

	curl -X POST -H "Authorization: Basic $(echo -n "_your_clientid:_your_clientsecret" | base64)" https://_your_okta_domain/oauth2/default/v2/token --data "grant_type=client_credentials&scope=customScope"
	
5. Copy the `access_token` from it and export it:

	export TOKEN="...access token here..."
	
6. Setup your client rate limit policy:

	curl -X POST -H "Authorization: Bearer $TOKEN" http://localhost:3000/clients --data "config.minute=10" --data "config.hour=100"
	
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

7. Check rate limit against a resource key:

	curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/clients/_your_client_id/resources/some_arbitrary_key
	
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


# References

[1]: Rate Limiting using Redis Lists and Sorted Sets, Sahil Jadon, https://medium.com/@sahiljadon/rate-limiting-using-redis-lists-and-sorted-sets-9b42bc192222

[2]: System Design — Rate limiter and Data modelling, Sai Sandeep Mopuri, https://medium.com/@saisandeepmopuri/system-design-rate-limiter-and-data-modelling-9304b0d18250

[3]: Rate Limiting, Kong, https://docs.konghq.com/hub/kong-inc/rate-limiting/#enabling-the-plugin-on-a-service

[4]: Rate Limiting (Enterprise), Kong, https://docs.konghq.com/enterprise/references/rate-limiting/
