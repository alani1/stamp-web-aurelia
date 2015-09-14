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
import {valueConverter} from 'aurelia-framework';
import _ from 'lodash';

@valueConverter("bitwiseToArray")
export class bitwiseToArrayValueConverter {

    toView(value, maxSize) {
        return this.determineShiftedValues(value, maxSize);
    }

    fromView(values) {
        let value = 0;
        if( values ) {
            _.each(values, v => {
                value += +v;
            });
        }
        return value;
    }

    determineShiftedValues(value, maxSize) {
        var values = [];
        var runningTotal = +value;
        for (var i = maxSize; i >= 0; i--) {
            if (runningTotal >> i === 1) {
                var binValue = Math.pow(2, i);
                runningTotal = runningTotal - binValue;
                values.push('' + binValue);
            }
        }
        return values;
    }
}
