import nprogress from 'nprogress';
import {bindable, noView, inject} from 'aurelia-framework';
import {EventAggregator} from 'aurelia-event-aggregator';
import {EventNames} from '../events/event-names';

@noView
@bindable("loading")
@inject(EventAggregator)
export class LoadingIndicator {

    constructor(eventBus) {
        this.eventBus = eventBus;
        this.loadingCount = 0;
        this.subscribe();
        nprogress.configure({
            showSpinner: false
        });
    }

    subscribe() {
        this.eventBus.subscribe(EventNames.loadingStarted, function() {
            nprogress.start();
            this.loadingCount++;
        });
        this.eventBus.subscribe(EventNames.loadingFinished, function() {
            this.loadingCount--;
            if (!this.loading && this.loadingCount === 0) {
                nprogress.done();
            }
        });

    }

    loadingChanged(newValue) {
        if (newValue) {
            nprogress.start();
        } else {
            nprogress.done();
        }

    }
}