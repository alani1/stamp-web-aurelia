/**
 Copyright 2016 Jason Drake

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
import {inject, LogManager, computedFrom} from 'aurelia-framework';
import {EventAggregator} from 'aurelia-event-aggregator';
import {I18N} from 'aurelia-i18n';
import {Countries} from '../../../services/countries';
import {Router} from 'aurelia-router';
import {Stamps} from '../../../services/stamps';
import {Preferences} from '../../../services/preferences';
import {PurchaseForm} from './purchase-form';
import {SessionContext} from '../../../services/session-context';
import {EventNames, StorageKeys, EventManaged} from '../../../events/event-managed';
import {LocationHelper} from '../../../util/location-helper';
import {StampFilter, ConditionFilter, CurrencyCode} from '../../../util/common-models';
import {PredicateUtilities} from '../../../util/object-utilities';
import {ImagePreviewEvents} from '../../elements/image-preview/image-preview';
import {Predicate, Operators, Parser} from 'odata-filter-parser';
import {asCurrencyValueConverter} from '../../value-converters/as-currency-formatted';
import bootbox from 'bootbox';
import {DialogService} from 'aurelia-dialog';
import _ from 'lodash';

const logger = LogManager.getLogger('stamp-list');

function createStamp(wantList) {
    return {
        id: 0,
        wantList: wantList,
        countryRef: -1,
        catalogueNumbers: [],
        stampOwnerships: []
    };
}

@inject(Element, EventAggregator, Router, Stamps, Countries, Preferences, asCurrencyValueConverter, I18N, DialogService)
export class StampList extends EventManaged {

    stamps = [];
    editingStamp = undefined;
    latestSelected = undefined;
    stampCount = 0;
    countries = [];
    heading = "Stamp List";
    displayMode = 'Grid';
    imageShown = false;
    imagePath;
    _defaultImagePath = 'http://drake-server.ddns.net:9001/Pictures/Stamps';
    editorShown = false;
    panelContents = "stamp-editor";
    subscribers = [];
    referenceMode = false;
    reportValue = "";
    reportType = "CatalogueValue";


    sortColumns = ['number', 'value', 'pricePaid' ];

    filters = StampFilter.symbols();
    stampFilter = StampFilter.ALL;

   conditionFilters = ConditionFilter.symbols();
   conditionFilter = ConditionFilter.ALL;

    currentFilters = [];

    pageSizes = [100, 250, 500, 1000, 2500, 5000];

    pageInfo = {
        total: 1,
        active: 0
    };

    options = {
        $filter: "",
        $top: 250,
        $skip: 0,
        sort: this.sortColumns[0],
        sortDirection: 'asc'
    };

    constructor(element, eventBus, router, stampService, countryService, preferenceService, currencyFormatter, i18next, dialogService) {
        super(eventBus);
        this.element = element;
        this.stampService = stampService;
        this.countryService = countryService;
        this.preferenceService = preferenceService;
        this.currencyFormatter = currencyFormatter;
        this.router = router;
        this.i18next = i18next;
        this.dialogService = dialogService;
    }

    bind() {
        this._searchHandler = this.processSearchRequest.bind(this);
        SessionContext.addContextListener(SessionContext.SEARCH_CHANGE, this._searchHandler );
    };

    unbind() {
        SessionContext.removeContextListener(SessionContext.SEARCH_CHANGE, this._searchHandler );
    };

    processSearchRequest(data, oldData) { //eslint-disable-line no-unused-vars
        let self = this;
        let options = (!self.options) ? {} : self.options;
        if( data ) {
            options.$filter = data.serialize();
            self.currentFilters = data.flatten();
            logger.debug(self.currentFilters);
            //TODO handle self.editorShown = false;
        }
        self.search();
    }

    purchase() {
        let selected = this.stampService.getSelected();
        if (selected && selected.length > 0) {
            selected = _.filter(selected, {wantList: false});
            if (selected.length > 0) {
                let purchaseModel = {
                    price: 0.0,
                    currency: CurrencyCode.USD.key,
                    updateExisting: true,
                    selectedStamps: selected
                };
                this.dialogService.open({viewModel: PurchaseForm, model: purchaseModel}).then(() => {
                    // post-process any purchases
                }).catch(() => {
                    // handle cancel
                });
            }
        }
    }

    selectAll(select) {
        if( !select ) {
            this.stampService.clearSelected();
            if( this.editingStamp ) {
                if( this.editorShown ) {
                    this.editorShown = false;
                }
                this.editingStamp = undefined;
                this.latestSelected = undefined;
            }
        } else {
            this.stampService.selectAll();
        }
    }

    getFilterText(filter) {
        return filter.description;
    }

    setStatistics(reportType) {
        let self = this;
        self.reportType = reportType;
        var opt = self.buildOptions();
        opt.$reportType = reportType;
        self.reportValue = self.i18next.tr('footer-statistics.calculating');

        self.stampService.executeReport(opt).then( result => {
            if( +result.value > 0 ) {
                self.reportValue = self.currencyFormatter.toView(+result.value, result.code);
            } else {
                self.reportValue = "";
            }

        });
    }

    generatePageModels(total, current) {
        this.pageModels = [];
        for (var i = 0; i < total; i++) {
            this.pageModels.push({page: i, current: (current === i)});
        }
        this.pageInfo.total = total;
        this.pageInfo.active = current;
    }

    setSize(size) {
        var active = parseInt((this.pageInfo.active * this.options.$top) / size);
        this.options.$skip = Math.max(0, size * active);
        this.options.$top = size;
        this.pageInfo.active = active;
        this.search();
    }

    get selectedCount() {
        return this.stampService.getSelected().length;
    }

    setConditionFilter(ordinal) {

        this.currentFilters = PredicateUtilities.removeMatches( 'condition', this.currentFilters );

        this.conditionFilter = ConditionFilter.get(ordinal);
        let conditions = [];
        switch (ordinal) {
            case 1:
                conditions = [0, 1, 4, 5];
                break;
            case 2:
                conditions = [2, 3, 7];
                break;
            case 3:
                conditions = [6];
                break;
        }
        if (conditions.length > 0) {
            let predicates = [];
            for (let i = 0; i < conditions.length; i++) {
                predicates.push(new Predicate({
                    subject: 'condition',
                    value: conditions[i]
                }));
            }
            this.currentFilters.push((predicates.length === 1 ) ? predicates[0] : Predicate.concat(Operators.OR, predicates));
        }
        this.search();

    }


    setFilter(ordinal) {
        this.currentFilters = PredicateUtilities.removeMatches( 'wantList', this.currentFilters );

        this.stampFilter = StampFilter.get(ordinal);

        let theFilter = new Predicate({
            subject: 'wantList'
        });
        switch(ordinal) {
            case 1:
                theFilter.value = 0;
                break;
            case 2:
                theFilter.value = 1;
                break;
            default:
                theFilter = null;
        }
        if( theFilter ) {
            this.currentFilters.push(theFilter);
        }
        this.search();
    }

    setPage(page) {
        this.pageInfo.active = Math.max(0, Math.min(page, this.pageInfo.total - 1));
        if (this.options.$top) {
            this.options.$skip = this.options.$top * this.pageInfo.active;
        }
        this.search();
    }

    setSort(attr) {
        this.options.sort = attr;
        if( !this.options.sortDirection ) {
            this.options.sortDirection = 'asc';
        }
        this.search();
    }

    clearSort() {
        this.options.sort = 'placeholder';
        this.search();
    }

    toggleSortDirection() {
        this.options.sortDirection = (this.options.sortDirection === 'asc') ? 'desc' : 'asc';
        this.search();
    }

    showEditor(action) {
        if (action === 'create-stamp' || action === 'create-wantList') {
            this.editingStamp = createStamp((action === 'create-wantList'));
            this.panelContents = "stamp-editor";
        } else if ( action === 'search-panel' ) {
            this.panelContents = action;
        }
        this.editorShown = true;
    }

    setDisplayMode(mode) {
        this.displayMode = mode;
    }

    getDisplayModeClass(mode) {
        return ( this.displayMode === mode ) ? 'active' : '';
    }

    @computedFrom('referenceMode', 'displayMode')
    get referenceTableState() {
        return this.referenceMode && this.displayMode === 'Grid' ? 'active' : (this.displayMode !== 'Grid') ? 'disabled' : '';
    }

    toggleCatalogueNumbers() {
        this.referenceMode = !this.referenceMode;
        localStorage.setItem(StorageKeys.referenceCatalogueNumbers, this.referenceMode);
    }

    clearSearch() {
        this.searchText = "";
        this.sendSearch();
    }

    sendSearch() {
        this.currentFilters = PredicateUtilities.removeMatches( 'description', this.currentFilters );
        if( this.searchText && this.searchText !== "") {
            this.currentFilters.unshift( new Predicate({
                subject: 'description',
                operators: Operators.EQUALS,
                value: this.searchText
            })/*Predicate.contains( 'description', this.searchText )*/);
        }
        this.search();
    }

    buildOptions() {
        let cOpts = this.options;
        let opts = {};

        if (cOpts.sort && cOpts.sort !== 'placeholder' && cOpts.sortDirection) {
            opts.$orderby = cOpts.sort + " " + cOpts.sortDirection;
        }
        opts.$top = cOpts.$top > -1 ? cOpts.$top : 100;
        if( this.currentFilters && this.currentFilters.length > 0 ) {
            let current = [];
            this.currentFilters.forEach( f => {
                current.push( f );
            });
            let predicate = (current.length > 1) ? Predicate.concat(Operators.AND, current) : this.currentFilters[0];
            opts.$filter = predicate.serialize();
            logger.debug("$filter=" + opts.$filter);
        }
        if (cOpts.$skip) {
            opts.$skip = cOpts.$skip;
        }
        return opts;
    }

    setupSubscriptions() {
        this.subscribe(EventNames.pageChanged, page => {
            this.setPage(page);
        });
        this.subscribe(EventNames.pageRefreshed, page => {
            this.options._ul = (new Date()).getTime();
            this.setPage(page);
        });
        this.subscribe(EventNames.stampCreate, () => {
            this.editingStamp = createStamp(false /* Not a wantlist */);
            this.editorShown = true;
        });

        this.subscribe(EventNames.panelCollapsed, config => {
            if (config.name === "stamp-list-editor-panel") {
                this.editorShown = false;
            }
        });

        this.subscribe(EventNames.showImage, stamp => {
            this.handleFullSizeImage(stamp);
        });
        this.subscribe(EventNames.stampEdit, stamp => {
            this.lastSelected = stamp;
            this.panelContents = 'stamp-editor';
            this.editingStamp = stamp;
            this.editorShown = true;
        });
        this.subscribe(EventNames.stampEditorCancel, () => {
            this.editorShown = false;
        });
        this.subscribe(EventNames.stampSaved, result => {
            if( !result.remainOpen) {
                this.editorShown = false;
            }
            // TODO Need to toggle editor without toggling
        });

        this.subscribe(EventNames.deleteSuccessful, obj => {
            if (obj && obj.type === this.stampService.getCollectionName()) {
                _.remove(this.stamps, {id: obj.id});
            }
        });
        this.subscribe(EventNames.toggleStampSelection, this.stampSelected.bind(this));

        this.subscribe(EventNames.stampRemove, stamp => {
            var _remove = function (model) {
                if (this.editingStamp && stamp.id === this.editingStamp.id) { // remove editing stamp
                    this.editingStamp = null;
                    this.editorShown = false;
                }
                this.stampService.remove(model).then(function() {
                    this.eventBus.publish(EventNames.stampCount, { stamp: model, increment: false });
                    var index = _.findIndex(this.stamps, {id: model.id});
                    this.stamps.splice(index, 1);
                }).catch(err => {
                    logger.error(err);
                });
            };

            bootbox.confirm({
                size: 'large',
                className: 'sw-dialog-wrapper',
                message: "Delete " + stamp.rate + ' - ' + stamp.description + "?",
                callback: (result) => {
                    if (result === true) {
                        _remove.call(this, stamp);

                    }
                }
            });
        });
    }

    stampSelected(obj) {
        if (obj && obj.model) {
            if (this.stampService.isSelected(obj.model)) {
                if( this.lastSelected.id !== obj.model.id ) {
                    this.lastSelected = obj.model;
                } else {
                    this.stampService.unselect(obj.model);
                    let selected = this.stampService.getSelected();
                    this.lastSelected = ( selected && selected.length > 0) ? selected[selected.length - 1] : undefined;
                    if( this.lastSelected && this.editorShown ) {
                        this.editingStamp = this.lastSelected;
                    } else {
                        this.editorShown = false;
                    }
                }
            } else {
                if( obj.shiftKey && !!this.lastSelected ) {
                    let lastIndex = _.indexOf(this.stamps, this.lastSelected);
                    let nowIndex = _.indexOf(this.stamps, obj.model);
                    let nowSelected = _.slice(this.stamps, Math.min(nowIndex, lastIndex), Math.max(nowIndex, lastIndex) + 1);
                    _.each( nowSelected, s => {
                        this.stampService.select(s);
                    });
                } else {
                    this.stampService.select(obj.model);
                }
                this.lastSelected = obj.model;
                if( this.editorShown ) {
                    this.editingStamp = obj.model;
                }
            }
        }
    }

    handleFullSizeImage(stamp) {
        if (stamp && !_.isEmpty(stamp.stampOwnerships)) {
            this.fullSizeImage = this.imagePath + '/' + _.first(stamp.stampOwnerships).img;
            this.imageShown = !this.imageShown;
        }
    }

    search() {
        return new Promise((resolve, reject) => {
            var opts = this.buildOptions();
            this.stampService.clearSelected();
            this.stampService.find(opts).then(result => {
                this.router.navigate(this.router.generate('stamp-list', opts));
                this.processStamps(result, opts);
                this.resetDisplay();
                resolve();
            }).catch(err => {
                logger.debug(err);
                reject(err);
            });
        });
    }

    processStamps(result, opts) {
        this.lastSelected = undefined; // clear any editing stamps
        this.generatePageModels(1, 0);
        this.stamps = result.models;
        this.stampCount = result.total;
        this.pageInfo.total = 1;
        this.pageInfo.active = 0;
        if (opts.$top) {
            this.pageInfo.total = parseInt(result.total / opts.$top) + 1;
            if (opts.$skip) {
                this.pageInfo.active = opts.$skip / opts.$top;
            }
        }
        this.setStatistics(this.reportType);
    }

    /**
     * Reset the display to the initial state (scroll top)
     */
    resetDisplay() {
        _.defer( () => {
            let targetElement = '.stamp-content';
            switch(this.displayMode) {
                case 'List':
                    targetElement += ' stamp-table';
                    break;
                case 'Upgrade':
                    targetElement += ' .stamp-replacement-table-wrapper';
                    break;
                default:
                    targetElement += ' .scroller';
            }
            let target = $(this.element).find(targetElement);
            target.animate({scrollTop: 0}, 'fast');
        });
    }

    attached() {
        this.setupSubscriptions();
    }

    activate(params, routeConfig) { //eslint-disable-line no-unused-vars
        let t = new Date().getTime();
        let self = this;
        this.referenceMode = (localStorage.getItem(StorageKeys.referenceCatalogueNumbers) === 'true');

        return new Promise((resolve, reject) => {
            Promise.all([this.countryService.find(), this.preferenceService.find()]).then( (results) => {
                let result = (results && results.length > 0 ) ? results[0] : undefined;
                this.countries = result ? result.models : [];
                let $filter = LocationHelper.getQueryParameter("$filter");
                if ($filter) {
                    let f = Parser.parse($filter);
                    if (f) {
                        this.currentFilters = f.flatten();
                        logger.debug(this.currentFilters);
                        SessionContext.setSearchCondition(f);
                    }
                } else if (result && result.total > 0) {
                    var indx = Math.floor(Math.random() * result.total);
                    this.currentFilters.push(new Predicate({
                        subject: 'countryRef',
                        value: this.countries[indx].id
                    }));
                }
                let $orderby = LocationHelper.getQueryParameter("$orderby");
                if( $orderby && $orderby.length > 1 ) {
                    let orderParts = $orderby.split(' ');

                    this.options.sort = orderParts[0];
                    this.options.sortDirection = orderParts[1];
                }

                let $top = this.preferenceService.getByNameAndCategory('pageSize', 'stamps');
                if( $top ) {
                    this.options.$top = +$top.value;
                }
                let $skip = LocationHelper.getQueryParameter("$skip");
                if( $skip ) {
                    this.options.$skip = $skip;
                }

                // extract image path from preferences.
                let _imagePath = this.preferenceService.getByNameAndCategory('imagePath', 'stamps');
                this.imagePath = ( !_.isEmpty(_imagePath)) ?  _imagePath.value : this._defaultImagePath;

                this.search().then( () => {
                    logger.debug("StampGrid initialization time: " + ((new Date().getTime()) - t) + "ms");
                    resolve();
                });
            }).catch(err => {
                reject(err);
            });
        });
    }

}

