# Simple Rate Limiting API

The goal of this little project was to come up with a way for web services to leverage rate limiting as an external service.
The implementation is inspired by the many researches done to find a good starting point for more production-like implementation.

* Rolling window ([with redis][1]) has been chosen (knowing drawbacks, especially size of lists for dayly/monthy limits for example)
* Redis ([lists][1] and [model][2]) has been chosen to help with the distributed need, and scalability.
* Kong ([Rate Limiting Plugin][3], [Enterprise version][4]) provided a LUA implementation of this, in an API Gateway setting (so different from here)


# References

[1]: Rate Limiting using Redis Lists and Sorted Sets, Sahil Jadon, https://medium.com/@sahiljadon/rate-limiting-using-redis-lists-and-sorted-sets-9b42bc192222

[2]: System Design — Rate limiter and Data modelling, Sai Sandeep Mopuri, https://medium.com/@saisandeepmopuri/system-design-rate-limiter-and-data-modelling-9304b0d18250

[3]: Rate Limiting, https://docs.konghq.com/hub/kong-inc/rate-limiting/#enabling-the-plugin-on-a-service

[4]: Rate Limiting (Enterprise), https://docs.konghq.com/enterprise/references/rate-limiting/
