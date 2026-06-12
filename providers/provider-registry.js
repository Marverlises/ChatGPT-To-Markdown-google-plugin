(function(global) {
    const providers = {};

    function registerProvider(provider) {
        if (!provider || !provider.id) {
            throw new Error("Provider must include an id");
        }
        providers[provider.id] = provider;
    }

    function getProviderById(id) {
        return providers[id] || null;
    }

    global.AI_EXPORT_PROVIDERS = {
        providers,
        registerProvider,
        getProviderById
    };
})(globalThis);
