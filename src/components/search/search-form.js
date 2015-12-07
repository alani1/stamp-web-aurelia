/**
 Copyright 2015 Jason Drake

 Licensed under the Apache License, Version 2.0 (the "License");
 you may not use this file except in compliance with the License.
 You may obtain a copy of the License at

 http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing, software
 distributed under the License is distributed on an "AS IS" BASIS,
 WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 See the License for the specific language governing permissions and
 limitations under the License.
 */
import {bindable, inject, customElement} from 'aurelia-framework';
import {BindingEngine} from 'aurelia-binding'; // technically this is a static not a DI until next release
import {EventAggregator} from 'aurelia-event-aggregator';
import {Countries} from '../../services/countries';
import {Albums} from '../../services/albums';
import {Sellers} from '../../services/sellers';
import {Predicate, Operators} from 'odata-filter-parser';
import {SessionContext} from '../../services/session-context';

import _ from 'lodash';

@customElement("search-form")
@bindable('model')
@inject(EventAggregator, BindingEngine, Countries, Albums, Sellers)
export class SearchForm {

    loading = true;
    minimizeOnSearch = true;

    searchFields = ['countryRef', 'albumRef', 'sellerRef'];

    constructor(eventBus, bindingEngine, countries, albums, sellers) {
        this.eventBus = eventBus;
        this.$bindingEngine = bindingEngine;
        this.countryServices = countries;
        this.albumServices = albums;
        this.sellerServices = sellers;
    }

    bind() {
        let self = this;

        self.loading = true;
        let conditions = SessionContext.getSearchCondition();
        if( conditions !== undefined ) {
            _.forEach(conditions.flatten(), filter => {
                self.model[filter.subject] = filter.value;
            });
        }

        return Promise.all( [
            this.loadService(this.countryServices, 'countries'),
            this.loadService(this.albumServices, 'albums'),
            this.loadService(this.sellerServices, 'sellers')
        ]).then( () => {
            self.loading = false;
        });
    };

    unbind() { };

    reset() {
        _.forOwn( this.model, (value, key) => {
            if( _.isNumber(value) ) {
                this.model[key] = -1;
            }
        });
    };

    search() {
        let predicates = [];
        _.forOwn( this.model, (value, key) => {
            if( _.isNumber(value) && value > -1 ) {
                predicates.push( new Predicate({
                    subject: key,
                    value: value
                }));
            }
        });
        if( predicates.length > 0 ) {
            let p = (predicates.length > 1) ? Predicate.concat(Operators.AND, predicates) : predicates[0];
            SessionContext.setSearchCondition(p);
        }

    }

    loadService(svc, collectionName) {
        var self = this;
        return new Promise(resolve => {
            svc.find(svc.getDefaultSearchOptions()).then(results => {
                self[collectionName] = results.models;
                resolve();
            });
        });

    }
}
