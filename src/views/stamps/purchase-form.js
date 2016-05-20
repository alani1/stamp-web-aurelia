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
import {DialogController} from 'aurelia-dialog';
import {bindable, LogManager} from 'aurelia-framework';
import {Validator, ValidationEngine} from 'aurelia-validatejs';
import {CurrencyCode} from '../../util/common-models';
import {Stamps} from '../../services/stamps';
import _ from 'lodash';


const logger = LogManager.getLogger('purchase-form');

@bindable('model')
export class PurchaseForm {
    static inject() {
        return [DialogController, Stamps];
    }
    catalogueTotal = 0.0;
    percentage = 0.0;
    codes = CurrencyCode.symbols();
    processing = false;
    processingCount = 0;
    errorMessage = "";
    isValid = false;

    constructor(controller, stampService) {
        this.controller = controller;
        this.stampService = stampService;
    }

    priceChanged() {
        if( this.model.price && +this.model.price > 0 && this.catalogueTotal > 0.0 ) {
            this.percentage = ( +this.model.price / this.catalogueTotal );
        } else {
            this.percentage = 0.0;
        }
        this.validate();
    }

    save() {
        let self = this;
        let results = [];
        self.processing = true;
        self.processingCount = 0;
        self.errorMessage = "";
        let count = self.model.selectedStamps.length;
        _.each( self.model.selectedStamps, function(stamp) {
            if(stamp.stampOwnerships && stamp.stampOwnerships.length > 0) {
                let owner = stamp.stampOwnerships[0];
                if( owner.pricePaid > 0.0 && self.model.updateExisting || owner.pricePaid <= 0.0 ) {
                    owner.pricePaid = +(stamp.activeCatalogueNumber.value / self.catalogueTotal * self.model.price).toFixed(2);
                    owner.code = self.model.currency;
                    let promise = self.stampService.save(stamp);
                    results.push(promise);
                    promise.then( () => {
                        self.processingCount++;
                        $('.progress-bar').css('width', self.processingCount * 1.0 / count * 100 + '%'); // need to manipulate the width
                    });

                }
            }
        });
        Promise.all(results).then( () => {
            logger.debug("Completed saving updates for " + results.length);
            self.processing = false;
            _.debounce( () => {
                this.controller.ok();
            }, 125)(this);
        }).catch( err => {
            self.processing = false;
            self.errorMessage = (err.statusText) ? err.statusText : err;
        });
    }

    activate(model) {
        model.currency = model.currency || CurrencyCode.USD.toString();
        this.model = model;
        this.catalogueTotal = 0.0;
        if(this.model && this.model.selectedStamps && this.model.selectedStamps.length > 0 ) {
            let self = this;
            _.each( this.model.selectedStamps, function( stamp ) {
                let activeCN = ( stamp.activeCatalogueNumber ) ? stamp.activeCatalogueNumber : undefined;
                if (activeCN) {
                    self.catalogueTotal += activeCN.value;
                } else {
                    logger.warn("No active number found.");
                }
            });
        }

        this.validator = new Validator(this.model)
            .ensure('price')
            .numericality({ lessThan: 9999.0, greaterThan: 0});
        this.reporter = ValidationEngine.getValidationReporter(this.model);
        this.observer = this.reporter.subscribe(this.handleValidation.bind(this));
        _.debounce( () => {
            this.validator.validate();
        }, 50)(this);
    }

    handleValidation(result) {
        this.isValid = result.length === 0;
    }

    validate() {
        this.validator.validate();
    }

    deactivate() {
        this.observer.dispose();
    }
}
