<?php

// Router for PHP's local development server; Apache uses .htaccess instead.
$path = rawurldecode(parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH) ?: '/');
if (preg_match('~^/(?:backend|scripts|var|tests|\.git)(?:/|$)|^/config(?:\.[^/]*)?\.php$|/\.|\.sqlite(?:-|$)|\.(?:sql|md|log)$~i', $path)) {
    http_response_code(404);
    exit('Not found');
}
return false;

