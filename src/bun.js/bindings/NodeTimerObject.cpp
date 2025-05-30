
#include "root.h"

#include "JavaScriptCore/InternalFieldTuple.h"
#include "JavaScriptCore/ArgList.h"
#include "JavaScriptCore/JSCast.h"
#include "JavaScriptCore/JSObject.h"
#include "JavaScriptCore/Heap.h"
#include "ZigGlobalObject.h"

#include "ZigGeneratedClasses.h"
#include <JavaScriptCore/JSPromise.h>
#include <JavaScriptCore/ObjectConstructor.h>
#include "JavaScriptCore/JSCJSValue.h"
#include "AsyncContextFrame.h"
namespace Bun {
using namespace JSC;

template<typename T>
void callInternal(T* timeout, JSGlobalObject* globalObject)
{
    static_assert(std::is_same_v<T, WebCore::JSTimeout> || std::is_same_v<T, WebCore::JSImmediate>,
        "wrong type passed to callInternal");

    auto& vm = JSC::getVM(globalObject);
    auto scope = DECLARE_THROW_SCOPE(vm);

    JSValue callbackValue = timeout->m_callback.get();
    JSCell* callbackCell = callbackValue.isCell() ? callbackValue.asCell() : nullptr;
    if (!callbackCell) {
        Bun__reportUnhandledError(globalObject, JSValue::encode(createNotAFunctionError(globalObject, callbackValue)));
        return;
    }

    JSValue restoreAsyncContext {};
    JSC::InternalFieldTuple* asyncContextData = nullptr;

    if (auto* wrapper = jsDynamicCast<AsyncContextFrame*>(callbackCell)) {
        callbackCell = wrapper->callback.get().asCell();
        asyncContextData = globalObject->m_asyncContextData.get();
        restoreAsyncContext = asyncContextData->getInternalField(0);
        asyncContextData->putInternalField(vm, 0, wrapper->context.get());
    }

    switch (callbackCell->type()) {
    case JSC::JSPromiseType: {
        // This was a Bun.sleep() call
        auto promise = jsCast<JSPromise*>(callbackCell);
        promise->resolve(globalObject, jsUndefined());
        break;
    }

    default: {
        auto callData = JSC::getCallData(callbackCell);
        if (callData.type == CallData::Type::None) {
            Bun__reportUnhandledError(globalObject, JSValue::encode(createNotAFunctionError(globalObject, callbackValue)));
            return;
        }

        MarkedArgumentBuffer args;
        if (timeout->m_arguments) {
            JSValue argumentsValue = timeout->m_arguments.get();
            auto* butterfly = jsDynamicCast<JSImmutableButterfly*>(argumentsValue);

            //  If it's a JSImmutableButterfly, there is more than 1 argument.
            if (butterfly) {
                unsigned length = butterfly->length();
                args.ensureCapacity(length);
                for (unsigned i = 0; i < length; ++i) {
                    args.append(butterfly->get(i));
                }
            } else {
                // Otherwise, it's a single argument.
                args.append(argumentsValue);
            }
        }

        JSC::profiledCall(globalObject, ProfilingReason::API, JSValue(callbackCell), JSC::getCallData(callbackCell), timeout, ArgList(args));
        break;
    }
    }

    if (UNLIKELY(scope.exception())) {
        auto* exception = scope.exception();
        scope.clearException();
        Bun__reportUnhandledError(globalObject, JSValue::encode(exception));
    }

    if (asyncContextData) {
        asyncContextData->putInternalField(vm, 0, restoreAsyncContext);
    }
}

extern "C" void Bun__JSTimeout__call(JSC::EncodedJSValue encodedTimeoutValue, JSC::JSGlobalObject* globalObject)
{
    auto& vm = globalObject->vm();
    if (UNLIKELY(vm.hasPendingTerminationException())) {
        return;
    }

    JSValue timeoutValue = JSValue::decode(encodedTimeoutValue);
    if (auto* timeout = jsDynamicCast<WebCore::JSTimeout*>(timeoutValue)) {
        return callInternal(timeout, globalObject);
    } else if (auto* immediate = jsDynamicCast<WebCore::JSImmediate*>(timeoutValue)) {
        return callInternal(immediate, globalObject);
    }

    ASSERT_NOT_REACHED_WITH_MESSAGE("Object passed to Bun__JSTimeout__call is not a JSTimeout or a JSImmediate");
}

}
